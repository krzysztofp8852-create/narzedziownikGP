-- Odbicie bez zasięgu (#88, ADR 0033): skan w skanerze programu czeka w kolejce offline telefonu i dochodzi na serwer
-- z prawdziwym czasem skanu. Wejście i wyjście, które przyszły z kolejki, mają oznaczenie „zapisane offline”.
--
-- Skan z kolejki, który nie pasuje do odbić zapisanych w międzyczasie (późniejsze odbicie tej osoby, wyjście bez
-- wejścia, drugie wejście na tę samą budowę, stary kod plakatu, zakończona budowa), nie zapisuje się jako odbicie,
-- tylko jako konflikt do wyjaśnienia przez właściciela albo kierownika budowy. Tak jak przy odbiciu zapisujemy tylko
-- wynik sprawdzenia położenia i odległość, nigdy współrzędne.

alter table app.punches
  add column entry_offline boolean not null default false,
  add column exit_offline boolean not null default false,
  add constraint punches_exit_offline check (left_at is not null or not exit_offline);

grant update (exit_offline) on app.punches to authenticated;

-- Jak w 20261105090000_punches.sql, z oznaczeniem offline przy wejściu i wyjściu.
create or replace function app.check_punch_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  own boolean := exists (select 1 from app.people p where p.id = old.person_id and p.user_id = auth.uid());
  manages boolean := exists (select 1 from app.locations l where l.id = old.location_id and l.manager_id = auth.uid());
begin
  if (new.company_id, new.person_id, new.location_id, new.punched_by, new.entered_at, new.entry_result,
      new.entry_distance_m, new.entry_operation_id, new.entry_offline)
     is distinct from (old.company_id, old.person_id, old.location_id, old.punched_by, old.entered_at,
      old.entry_result, old.entry_distance_m, old.entry_operation_id, old.entry_offline) then
    raise exception 'Wejścia odbicia % się nie zmienia', old.id;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.left_at, new.exit_via, new.exit_result, new.exit_distance_m, new.exit_operation_id, new.exit_offline)
     is distinct from (old.left_at, old.exit_via, old.exit_result, old.exit_distance_m, old.exit_operation_id, old.exit_offline)
     and (old.left_at is not null or not own) then
    raise exception 'Wyjście odbicia % zapisuje raz sama osoba', old.id;
  end if;
  if (new.explained_at, new.explained_by, new.explanation) is distinct from (old.explained_at, old.explained_by, old.explanation)
     and (old.explained_at is not null or new.explained_by is distinct from auth.uid()
          or not (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and manages and not own))
          or (new.entry_result = 'na_budowie' and coalesce(new.exit_result, 'na_budowie') = 'na_budowie')) then
    raise exception 'Odbicia % aktor nie wyjaśnia', old.id;
  end if;
  return new;
end
$$;

create table app.punch_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  person_id uuid not null,
  -- null: kodu plakatu nie ma już w firmie (np. „Nowy kod” przed wysłaniem).
  location_id uuid,
  punched_by uuid not null,
  operation_id uuid not null,
  -- Chwila skanu w telefonie i chwila dotarcia na serwer.
  scanned_at timestamptz not null,
  received_at timestamptz not null,
  -- Czy telefon pytał „Kończysz?” i osoba potwierdziła wyjście.
  confirm_exit boolean not null,
  reason text not null check (reason in ('kod_niewazny', 'budowa_zakonczona', 'pozniejsze_odbicie', 'nie_odbity_tu', 'juz_odbity_tu')),
  check_result text check (check_result in ('na_budowie', 'poza_budowa', 'brak_polozenia', 'bez_sprawdzenia')),
  check_distance_m integer check (check_distance_m >= 0),
  explained_at timestamptz,
  explained_by uuid,
  explanation text check (explanation is null or (length(btrim(explanation)) > 0 and length(explanation) <= 500)),
  sequence_number bigint generated always as identity,
  constraint punch_conflicts_operation_per_company unique (company_id, operation_id),
  constraint punch_conflicts_check check (
    (location_id is not null or check_result is null)
    and (check_distance_m is null or check_result in ('na_budowie', 'poza_budowa'))
    and (check_result is distinct from 'poza_budowa' or check_distance_m is not null)
  ),
  constraint punch_conflicts_explained check (
    (explained_at is null) = (explained_by is null) and (explained_at is not null or explanation is null)
  ),
  foreign key (company_id, person_id) references app.people (company_id, id),
  foreign key (company_id, location_id) references app.locations (company_id, id),
  foreign key (company_id, punched_by) references app.users (company_id, user_id),
  foreign key (company_id, explained_by) references app.users (company_id, user_id)
);
create index punch_conflicts_location_idx on app.punch_conflicts (location_id);

alter table app.punch_conflicts enable row level security;

grant select, insert on app.punch_conflicts to authenticated;
grant update (explained_at, explained_by, explanation) on app.punch_conflicts to authenticated;

-- Widzą: właściciel wszystkie, kierownik konflikty na budowach, których jest kierownikiem, a każdy własne.
create policy punch_conflicts_select on app.punch_conflicts for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  );
-- Konflikt zapisuje sama osoba, wysyłając własny skan z kolejki.
create policy punch_conflicts_insert on app.punch_conflicts for insert to authenticated
  with check (
    company_id = app.current_company_id() and punched_by = auth.uid()
    and exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid() and p.active)
    and explained_at is null
  );
-- Wyjaśnia raz właściciel albo kierownik budowy, który nie jest tą osobą.
create policy punch_conflicts_update on app.punch_conflicts for update to authenticated
  using (
    company_id = app.current_company_id() and explained_at is null
    and (
      app.current_user_role() = 'wlasciciel'
      or (
        app.current_user_role() = 'kierownik'
        and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid())
        and not exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      )
    )
  )
  with check (company_id = app.current_company_id() and explained_by = auth.uid());
