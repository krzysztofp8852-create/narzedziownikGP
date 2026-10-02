-- Zapomniane wyjście i poprawki odbić (#90, ADR 0035).
--
-- O 18:00 w Polsce zadanie harmonogramu przypomina o wyjściu każdemu, kto odbił wejście osoby nadal odbitej (sobie
-- albo, jako kierownik, osobie z kartoteki), raz na odbicie (`exit_reminded_at`). O północy w Polsce otwarte odbicia
-- z poprzednich dni zamykają się „bez wyjścia”: `left_at` to północ po dniu wejścia, a odbicie czeka na wyjaśnienie
-- i nie liczy się do czasu na budowie, dopóki ktoś nie uzupełni wyjścia.
--
-- Godzinę wejścia albo wyjścia poprawia (albo brakujące wyjście uzupełnia) właściciel albo kierownik budowy, zawsze
-- z powodem. Kierownik nie poprawia własnych odbić (te poprawia właściciel), a pracownik i magazynier żadnych. Poprawka to wiersz `app.punch_corrections` z godziną sprzed niej; godziny
-- odbicia zmienia tylko wyzwalacz tej tabeli.

alter table app.punches
  add column exit_reminded_at timestamptz,
  drop constraint punches_exit_via_check,
  -- `bez_wyjscia`: zamknięte o północy bez wyjścia; `uzupelnione`: wyjście wpisane poprawką, bez skanu.
  add constraint punches_exit_via_check check (exit_via in ('wyjscie', 'przejscie', 'bez_wyjscia', 'uzupelnione')),
  add constraint punches_exit_without_scan check (
    exit_via is null or exit_via in ('wyjscie', 'przejscie') or (exit_operation_id is null and not exit_offline)
  );

create table app.punch_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  punch_id uuid not null,
  field text not null check (field in ('wejscie', 'wyjscie')),
  -- Godzina sprzed poprawki (wpisuje ją wyzwalacz); null, gdy wyjścia nie było (odbita teraz albo „bez wyjścia”).
  from_at timestamptz,
  to_at timestamptz not null,
  reason text not null check (length(btrim(reason)) > 0 and length(reason) <= 500),
  corrected_by uuid not null,
  corrected_at timestamptz not null,
  sequence_number bigint generated always as identity,
  constraint punch_corrections_entry_from check (field = 'wyjscie' or from_at is not null),
  foreign key (company_id, punch_id) references app.punches (company_id, id),
  foreign key (company_id, corrected_by) references app.users (company_id, user_id)
);
create index punch_corrections_punch_idx on app.punch_corrections (punch_id, sequence_number);

alter table app.punch_corrections enable row level security;

grant select, insert on app.punch_corrections to authenticated;

-- Poprawki widzi ten, kto widzi odbicie.
create policy punch_corrections_select on app.punch_corrections for select to authenticated
  using (company_id = app.current_company_id() and exists (select 1 from app.punches p where p.id = punch_id));
-- Poprawia właściciel albo kierownik budowy odbicia, które nie jest jego własne (odbicia brygady, które sam odbił,
-- też: i tak decyduje, kiedy je odbija).
create policy punch_corrections_insert on app.punch_corrections for insert to authenticated
  with check (
    company_id = app.current_company_id() and corrected_by = auth.uid()
    and exists (
      select 1 from app.punches p
      join app.locations l on l.id = p.location_id
      join app.people pe on pe.id = p.person_id
      where p.id = punch_id
        and (
          app.current_user_role() = 'wlasciciel'
          or (app.current_user_role() = 'kierownik' and l.manager_id = auth.uid() and pe.user_id is distinct from auth.uid())
        )
    )
  );

-- Godzina sprzed poprawki pochodzi z odbicia, a nie od aktora.
create function app.remember_corrected_time() returns trigger
language plpgsql set search_path = ''
as $$
begin
  select case when new.field = 'wejscie' then p.entered_at when p.exit_via in ('wyjscie', 'przejscie', 'uzupelnione') then p.left_at end
  into new.from_at
  from app.punches p where p.id = new.punch_id;
  return new;
end
$$;
create trigger punch_corrections_from before insert on app.punch_corrections
  for each row execute function app.remember_corrected_time();

-- Po zapisie poprawki (już po sprawdzeniu polityki) przestawia godzinę odbicia. Uzupełnione wyjście zamyka odbicie
-- osoby odbitej teraz albo „bez wyjścia”. SECURITY DEFINER, bo nikt nie zmienia godzin odbicia wprost.
create function app.apply_punch_correction() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.field = 'wejscie' then
    update app.punches set entered_at = new.to_at where id = new.punch_id and company_id = new.company_id;
  else
    update app.punches
    set left_at = new.to_at,
        exit_via = case when exit_via in ('wyjscie', 'przejscie', 'uzupelnione') then exit_via else 'uzupelnione' end
    where id = new.punch_id and company_id = new.company_id;
  end if;
  return null;
end
$$;
revoke execute on function app.apply_punch_correction() from public;
create trigger punch_corrections_apply after insert on app.punch_corrections
  for each row execute function app.apply_punch_correction();

-- Jak w 20261107090000_punches_by_manager.sql. Godziny wejścia i wyjścia (i nic poza nimi) zmienia też poprawka:
-- wyzwalacz app.apply_punch_correction, który działa z wyzwalacza, stąd głębokość. Wyjaśnia się też odbicie „bez
-- wyjścia”, a przypomnienie o wyjściu zapisuje tylko zadanie harmonogramu.
create or replace function app.check_punch_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  own boolean := exists (select 1 from app.people p where p.id = old.person_id and p.user_id = auth.uid());
  manages boolean := exists (select 1 from app.locations l where l.id = old.location_id and l.manager_id = auth.uid());
  punched boolean := old.punched_by = auth.uid() or old.exit_punched_by = auth.uid();
  corrected app.punches := old;
begin
  if pg_trigger_depth() > 1 then
    corrected.entered_at := new.entered_at;
    corrected.left_at := new.left_at;
    corrected.exit_via := new.exit_via;
    if corrected is not distinct from new then
      return new;
    end if;
  end if;
  if (new.company_id, new.person_id, new.location_id, new.punched_by, new.entered_at, new.entry_result,
      new.entry_distance_m, new.entry_operation_id, new.entry_offline)
     is distinct from (old.company_id, old.person_id, old.location_id, old.punched_by, old.entered_at,
      old.entry_result, old.entry_distance_m, old.entry_operation_id, old.entry_offline) then
    raise exception 'Wejścia odbicia % się nie zmienia', old.id;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.left_at, new.exit_via, new.exit_result, new.exit_distance_m, new.exit_operation_id, new.exit_offline, new.exit_punched_by)
     is distinct from (old.left_at, old.exit_via, old.exit_result, old.exit_distance_m, old.exit_operation_id, old.exit_offline, old.exit_punched_by)
     and (old.left_at is not null or new.exit_punched_by is distinct from auth.uid()
          or coalesce(new.exit_via not in ('wyjscie', 'przejscie'), true)
          or not (own or app.current_user_role() in ('wlasciciel', 'kierownik'))) then
    raise exception 'Wyjście odbicia % zapisuje raz sama osoba albo właściciel lub kierownik', old.id;
  end if;
  if new.exit_reminded_at is distinct from old.exit_reminded_at then
    raise exception 'Przypomnienie o wyjściu z odbicia % zapisuje zadanie harmonogramu', old.id;
  end if;
  if (new.explained_at, new.explained_by, new.explanation) is distinct from (old.explained_at, old.explained_by, old.explanation)
     and (old.explained_at is not null or new.explained_by is distinct from auth.uid()
          or not (app.current_user_role() = 'wlasciciel'
                  or (app.current_user_role() = 'kierownik' and manages and not own and not coalesce(punched, false)))
          or (new.entry_result = 'na_budowie' and coalesce(new.exit_result, 'na_budowie') = 'na_budowie'
              and new.exit_via is distinct from 'bez_wyjscia')) then
    raise exception 'Odbicia % aktor nie wyjaśnia', old.id;
  end if;
  return new;
end
$$;

-- Koniec poprzedniego i początek następnego odbicia tej samej osoby, żeby poprawka na nie nie nachodziła. Kierownik
-- nie widzi odbić osoby spoza swoich budów, więc granice podaje ta funkcja: właścicielowi i kierownikowi, bez historii.
create function app.punch_neighbours(p_punch_id uuid)
returns table (previous_left_at timestamptz, next_entered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select
    -- Północ odbicia „bez wyjścia” to nie godzina wyjścia: granicą jest jego wejście.
    (select max(case when o.exit_via = 'bez_wyjscia' then o.entered_at else o.left_at end)
     from app.punches o where o.person_id = p.person_id and o.id <> p.id and o.entered_at <= p.entered_at),
    (select min(o.entered_at) from app.punches o where o.person_id = p.person_id and o.id <> p.id and o.entered_at >= p.entered_at)
  from app.punches p
  where p.id = p_punch_id and p.company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'kierownik')
$$;
revoke execute on function app.punch_neighbours(uuid) from public;
grant execute on function app.punch_neighbours(uuid) to authenticated;

alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy', 'tylko_do_odczytu_wkrotce', 'tylko_do_odczytu', 'terminy',
                  'sprzet_wynajety', 'uprawnienia', 'przypomnienie_wyjscia'));
