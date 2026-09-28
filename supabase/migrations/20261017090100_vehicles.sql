-- Pojazdy (np. bus brygady): lokalizacja z nazwą, jednym kierownikiem, statusem
-- aktywny / nieaktywny i alarmem po progu dni, domyślnie wyłączonym. Dodaje je,
-- zmienia kierownika, włącza alarm i dezaktywuje tylko właściciel; dezaktywować
-- można tylko pojazd bez narzędzi w obiegu, a nieaktywnego nikt nie przywraca.
-- Ruchy: baza → pojazd to wydanie, pojazd → baza to zwrot, a pojazd ↔ budowa
-- i pojazd ↔ pojazd to przeniesienie, z uprawnieniami kierownika jak dla budowy.

alter table app.locations
  add column active boolean,
  add column alarm_enabled boolean,
  drop constraint locations_site_fields,
  add constraint locations_site_fields check (
    case kind
      -- `address is not null` wprost: sam `length(btrim(null)) > 0` daje null, a taki CHECK przechodzi.
      when 'budowa' then address is not null and length(btrim(address)) > 0 and manager_id is not null and status is not null
        and active is null and alarm_enabled is null
      when 'pojazd' then address is null and manager_id is not null and status is null
        and active is not null and alarm_enabled is not null
      else address is null and manager_id is null and status is null and active is null and alarm_enabled is null
    end
  );

grant insert (active, alarm_enabled) on app.locations to authenticated;
grant update (active, alarm_enabled) on app.locations to authenticated;

drop policy locations_insert_by_owner on app.locations;
create policy locations_insert_by_owner on app.locations for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.current_user_role() = 'wlasciciel'
    and (
      kind = 'serwis'
      -- Nowa budowa jest zawsze aktywna; zamyka się ją osobnym poleceniem.
      or (kind = 'budowa' and status = 'aktywna' and app.is_site_manager_candidate(manager_id))
      -- Nowy pojazd jest aktywny, z alarmem wyłączonym.
      or (kind = 'pojazd' and active and not alarm_enabled and app.is_site_manager_candidate(manager_id))
    )
  );

-- Budowa: kierownika aktywnej zmienia właściciel, zamyka ją właściciel albo jej kierownik.
-- Pojazd: aktywny zmienia tylko właściciel, a kierownik zostaje kandydatem albo pojazd przestaje być aktywny.
drop policy locations_update on app.locations;
create policy locations_update on app.locations for update to authenticated
  using (
    company_id = app.current_company_id()
    and case kind
      when 'budowa' then status = 'aktywna'
        and (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and manager_id = auth.uid()))
      when 'pojazd' then active and app.current_user_role() = 'wlasciciel'
      else false
    end
  )
  with check (
    company_id = app.current_company_id()
    and case kind
      when 'pojazd' then not active or app.is_site_manager_candidate(manager_id)
      else case status
        when 'aktywna' then app.current_user_role() = 'wlasciciel' and app.is_site_manager_candidate(manager_id)
        when 'zakonczona' then finished_by = auth.uid()
        else false
      end
    end
  );

-- Dezaktywacja niczego poza statusem nie zmienia, a narzędzia w obiegu ją blokują (jak zamknięcie budowy).
create function app.check_vehicle_deactivation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.manager_id is distinct from old.manager_id or new.alarm_enabled is distinct from old.alarm_enabled then
    raise exception 'Przy dezaktywacji pojazdu % nie zmienia się nic poza statusem', old.id;
  end if;
  if exists (select 1 from app.tools t where t.location_id = new.id and t.state = 'w_obiegu') then
    raise exception 'Na pojeździe % zostały narzędzia w obiegu', old.id using errcode = 'GP409';
  end if;
  return new;
end
$$;
revoke execute on function app.check_vehicle_deactivation() from public;

create trigger locations_deactivate_vehicle before update of active on app.locations
  for each row when (old.active and not new.active)
  execute function app.check_vehicle_deactivation();

-- Narzędzie w obiegu jest tylko na aktywnej budowie albo aktywnym pojeździe. Blokada lokalizacji
-- do odczytu czeka na równoległe zamknięcie budowy albo dezaktywację pojazdu.
create or replace function app.check_tool_on_active_site() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  place record;
begin
  select l.kind, l.status, l.active into place
  from app.locations l where l.id = new.location_id and l.kind in ('budowa', 'pojazd') for share;
  if place.status = 'zakonczona' then
    raise exception 'Narzędzie % w obiegu nie może być na zakończonej budowie', new.id using errcode = 'GP409';
  end if;
  if place.active = false then
    raise exception 'Narzędzie % w obiegu nie może być na nieaktywnym pojeździe', new.id using errcode = 'GP409';
  end if;
  return null;
end
$$;

-- Budowa albo pojazd, na które można dowieźć sprzęt: aktywna budowa albo aktywny pojazd.
create function app.is_open_site_or_vehicle(location_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.locations l
    where l.id = location_id and l.company_id = app.current_company_id()
      and ((l.kind = 'budowa' and l.status = 'aktywna') or (l.kind = 'pojazd' and l.active))
  )
$$;
revoke execute on function app.is_open_site_or_vehicle(uuid) from public;
grant execute on function app.is_open_site_or_vehicle(uuid) to authenticated;

-- Czy aktor rusza sprzęt tej budowy albo pojazdu: magazynier i właściciel każdej, kierownik swojej.
create function app.moves_tools_of(location_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.locations l
    where l.id = location_id and l.company_id = app.current_company_id() and l.kind in ('budowa', 'pojazd')
      and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
  )
$$;
revoke execute on function app.moves_tools_of(uuid) from public;
grant execute on function app.moves_tools_of(uuid) to authenticated;

drop policy movements_insert on app.movements;
create policy movements_insert on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and case
      when kind = 'przyjecie' then
        from_location_id is null
        and app.current_user_role() in ('wlasciciel', 'magazynier')
      when kind = 'wydanie' then
        exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'baza')
        and app.is_open_site_or_vehicle(to_location_id)
        and app.moves_tools_of(to_location_id)
      when kind = 'zwrot' then
        app.moves_tools_of(from_location_id)
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      when kind = 'przeniesienie' then
        from_location_id <> to_location_id
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind in ('budowa', 'pojazd'))
        and app.is_open_site_or_vehicle(to_location_id)
        and app.moves_tools_of(to_location_id)
      when kind = 'do_serwisu' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id
            and (
              (app.current_user_role() in ('wlasciciel', 'magazynier') and l.kind in ('baza', 'budowa'))
              or (l.kind = 'budowa' and l.manager_id = auth.uid())
            )
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'serwis')
      when kind = 'z_serwisu' then
        app.current_user_role() in ('wlasciciel', 'magazynier')
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'serwis')
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      -- Cofnąć można tylko własny ruch, dokładnie w odwrotną stronę i nie na zakończoną budowę
      -- ani nieaktywny pojazd. Okna 15 minut pilnuje Rejestr: czas zapisu podaje jego zegar.
      when kind = 'cofniecie' then
        not exists (
          select 1 from app.locations l
          where l.id = movements.to_location_id
            and ((l.kind = 'budowa' and l.status <> 'aktywna') or (l.kind = 'pojazd' and not l.active))
        )
        and exists (
          select 1 from app.movements o
          where o.id = movements.reverses_movement_id
            and o.author_id = auth.uid()
            and o.kind in ('wydanie', 'zwrot', 'przeniesienie', 'do_serwisu', 'z_serwisu')
            and o.from_location_id = movements.to_location_id
            and o.to_location_id = movements.from_location_id
        )
      when kind in ('korekta', 'zaginiecie', 'wycofanie') then app.current_user_role() = 'wlasciciel'
      else false
    end
  );
