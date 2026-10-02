-- Kierownik i właściciel odbijają osoby z kartoteki (#89, ADR 0034): po skanie plakatu zaznaczają na liście „Odbij
-- też…” aktywne osoby (np. robotnika bez telefonu albo konta) i zapisują dla każdej wejście, wyjście albo przejście,
-- z wynikiem sprawdzenia położenia odbijającego. Kto odbił wejście, mówi `punched_by`, a kto wyjście:
-- `exit_punched_by` (null, gdy odbicie zamknął aktor systemowy). Pracownik i magazynier odbijają tylko siebie.
--
-- Kierownik widzi odbicia na budowach, których jest kierownikiem, własne i te, które sam odbił. Żeby przenieść osobę
-- z budowy, której nie prowadzi (przejście), musi wiedzieć, gdzie jest odbita teraz, i zamknąć tamto odbicie: robią
-- to dwie funkcje niżej, bez dostępu do historii jej odbić.

alter table app.punches
  add column exit_punched_by uuid,
  add constraint punches_exit_punched_by check (left_at is not null or exit_punched_by is null),
  add foreign key (company_id, exit_punched_by) references app.users (company_id, user_id);

-- Dotychczasowe wyjścia zapisała sama osoba, która odbiła wejście.
update app.punches set exit_punched_by = punched_by where left_at is not null;

grant update (exit_punched_by) on app.punches to authenticated;

-- Jak w 20261106090000_offline_punches.sql. Wyjście zapisuje raz sama osoba albo właściciel lub kierownik (i wpisuje
-- siebie jako odbijającego). Kierownik nie wyjaśnia odbić, które sam odbił: zostają dla właściciela, jak jego własne.
create or replace function app.check_punch_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  own boolean := exists (select 1 from app.people p where p.id = old.person_id and p.user_id = auth.uid());
  manages boolean := exists (select 1 from app.locations l where l.id = old.location_id and l.manager_id = auth.uid());
  punched boolean := old.punched_by = auth.uid() or old.exit_punched_by = auth.uid();
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
  if (new.left_at, new.exit_via, new.exit_result, new.exit_distance_m, new.exit_operation_id, new.exit_offline, new.exit_punched_by)
     is distinct from (old.left_at, old.exit_via, old.exit_result, old.exit_distance_m, old.exit_operation_id, old.exit_offline, old.exit_punched_by)
     and (old.left_at is not null or new.exit_punched_by is distinct from auth.uid()
          or not (own or app.current_user_role() in ('wlasciciel', 'kierownik'))) then
    raise exception 'Wyjście odbicia % zapisuje raz sama osoba albo właściciel lub kierownik', old.id;
  end if;
  if (new.explained_at, new.explained_by, new.explanation) is distinct from (old.explained_at, old.explained_by, old.explanation)
     and (old.explained_at is not null or new.explained_by is distinct from auth.uid()
          or not (app.current_user_role() = 'wlasciciel'
                  or (app.current_user_role() = 'kierownik' and manages and not own and not coalesce(punched, false)))
          or (new.entry_result = 'na_budowie' and coalesce(new.exit_result, 'na_budowie') = 'na_budowie')) then
    raise exception 'Odbicia % aktor nie wyjaśnia', old.id;
  end if;
  return new;
end
$$;

-- Widzą: właściciel wszystkie, kierownik odbicia na budowach, których jest kierownikiem, każdy własne i te, które
-- sam odbił (wejście albo wyjście).
drop policy punches_select on app.punches;
create policy punches_select on app.punches for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or punched_by = auth.uid()
      or exit_punched_by = auth.uid()
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  );
-- Każdy odbija siebie, a właściciel i kierownik także aktywne osoby z kartoteki; zawsze jako odbijający.
drop policy punches_insert on app.punches;
create policy punches_insert on app.punches for insert to authenticated
  with check (
    company_id = app.current_company_id() and punched_by = auth.uid()
    and exists (
      select 1 from app.people p
      where p.id = person_id and p.active and (p.user_id = auth.uid() or app.current_user_role() in ('wlasciciel', 'kierownik'))
    )
    and exists (select 1 from app.locations l where l.id = location_id and (l.kind = 'baza' or (l.kind = 'budowa' and l.status = 'aktywna')))
    and left_at is null and explained_at is null
  );
drop policy punches_update on app.punches;
create policy punches_update on app.punches for update to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or punched_by = auth.uid()
      or exit_punched_by = auth.uid()
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  )
  with check (company_id = app.current_company_id());

-- Stan odbić aktywnej osoby firmy aktora: otwarte odbicie (gdzie jest odbita teraz) i chwila ostatniego odbicia.
-- Dostaje go sama osoba oraz właściciel i kierownik, którzy mogą ją odbić; inni nic. Bez historii odbić.
create function app.punch_state(p_person_id uuid)
returns table (open_punch_id uuid, open_location_id uuid, latest timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.location_id, (select max(coalesce(p.left_at, p.entered_at)) from app.punches p where p.person_id = pe.id)
  from app.people pe
  left join app.punches o on o.person_id = pe.id and o.left_at is null
  where pe.id = p_person_id and pe.company_id = app.current_company_id() and pe.active
    and (pe.user_id = auth.uid() or app.current_user_role() in ('wlasciciel', 'kierownik'))
$$;
revoke execute on function app.punch_state(uuid) from public;
grant execute on function app.punch_state(uuid) to authenticated;

-- Wyjście albo przejście aktywnej osoby odbijanej przez właściciela albo kierownika, także z budowy, której kierownik
-- nie prowadzi. Odbijającym wyjścia jest aktor. Zwraca, czy odbicie było otwarte i się zamknęło.
create function app.close_punch_of(
  p_punch_id uuid,
  p_left_at timestamptz,
  p_exit_via text,
  p_exit_result text,
  p_exit_distance_m integer,
  p_operation_id uuid,
  p_offline boolean
) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if app.current_user_role() is null or app.current_user_role() not in ('wlasciciel', 'kierownik') then
    return false;
  end if;
  update app.punches p
  set left_at = p_left_at, exit_via = p_exit_via, exit_result = p_exit_result, exit_distance_m = p_exit_distance_m,
      exit_operation_id = p_operation_id, exit_offline = p_offline, exit_punched_by = auth.uid()
  where p.id = p_punch_id and p.company_id = app.current_company_id() and p.left_at is null
    and exists (select 1 from app.people pe where pe.id = p.person_id and pe.active);
  return found;
end
$$;
revoke execute on function app.close_punch_of(uuid, timestamptz, text, text, integer, uuid, boolean) from public;
grant execute on function app.close_punch_of(uuid, timestamptz, text, text, integer, uuid, boolean) to authenticated;

-- Konflikty z kolejki offline: widzi je też ten, kto odbijał, a zapisuje właściciel i kierownik także za osobę, którą
-- odbijał, również taką, która przed wysłaniem przestała być aktywna (`osoba_nieaktywna`; inaczej skan blokowałby
-- kolejkę odbijającego). Kierownik nie wyjaśnia konfliktów, które sam odbił.
alter table app.punch_conflicts drop constraint punch_conflicts_reason_check;
alter table app.punch_conflicts add constraint punch_conflicts_reason_check check (
  reason in ('kod_niewazny', 'budowa_zakonczona', 'pozniejsze_odbicie', 'nie_odbity_tu', 'juz_odbity_tu', 'osoba_nieaktywna')
);
drop policy punch_conflicts_select on app.punch_conflicts;
create policy punch_conflicts_select on app.punch_conflicts for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or punched_by = auth.uid()
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  );
drop policy punch_conflicts_insert on app.punch_conflicts;
create policy punch_conflicts_insert on app.punch_conflicts for insert to authenticated
  with check (
    company_id = app.current_company_id() and punched_by = auth.uid()
    and exists (
      select 1 from app.people p
      where p.id = person_id and ((p.user_id = auth.uid() and p.active) or app.current_user_role() in ('wlasciciel', 'kierownik'))
    )
    and explained_at is null
  );
drop policy punch_conflicts_update on app.punch_conflicts;
create policy punch_conflicts_update on app.punch_conflicts for update to authenticated
  using (
    company_id = app.current_company_id() and explained_at is null
    and (
      app.current_user_role() = 'wlasciciel'
      or (
        app.current_user_role() = 'kierownik'
        and punched_by <> auth.uid()
        and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid())
        and not exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      )
    )
  )
  with check (company_id = app.current_company_id() and explained_by = auth.uid());
