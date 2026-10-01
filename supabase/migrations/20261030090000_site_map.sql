-- Mapa budów: aktywna budowa i baza z adresem mają na mapie położenie (szerokość i długość geograficzną).
-- Serwer zamienia adres na punkt (geokodowanie) przy założeniu budowy i przy zmianie adresu, a właściciel może
-- pinezkę przesunąć ręcznie. Położenie jest tylko przy adresie: zmiana adresu je czyści, a bez adresu (baza)
-- miejsca nie ma na mapie. Baza dostaje opcjonalny adres; zmienia go, jak i adres budowy, tylko właściciel.

alter table app.locations
  add column latitude double precision,
  add column longitude double precision,
  drop constraint locations_site_fields,
  add constraint locations_site_fields check (
    case kind
      -- `address is not null` wprost: sam `length(btrim(null)) > 0` daje null, a taki CHECK przechodzi.
      when 'budowa' then address is not null and length(btrim(address)) > 0 and manager_id is not null and status is not null
        and active is null and alarm_enabled is null
      when 'pojazd' then address is null and manager_id is not null and status is null
        and active is not null and alarm_enabled is not null
      when 'baza' then (address is null or length(btrim(address)) > 0) and manager_id is null and status is null
        and active is null and alarm_enabled is null
      else address is null and manager_id is null and status is null and active is null and alarm_enabled is null
    end
  ),
  -- Adres mają tylko budowa i baza, więc tylko one mają położenie. NaN nie mieści się w żadnym przedziale.
  add constraint locations_position check (
    (latitude is null) = (longitude is null)
    and (latitude is null or (address is not null and latitude between -90 and 90 and longitude between -180 and 180))
  );

grant update (address, latitude, longitude) on app.locations to authenticated;

-- Jak w 20261017090100_vehicles.sql, a do tego bazę (jej adres i pinezkę) zmienia właściciel.
drop policy locations_update on app.locations;
create policy locations_update on app.locations for update to authenticated
  using (
    company_id = app.current_company_id()
    and case kind
      when 'budowa' then status = 'aktywna'
        and (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and manager_id = auth.uid()))
      when 'pojazd' then active and app.current_user_role() = 'wlasciciel'
      when 'baza' then app.current_user_role() = 'wlasciciel'
      else false
    end
  )
  with check (
    company_id = app.current_company_id()
    and case kind
      when 'pojazd' then not active or app.is_site_manager_candidate(manager_id)
      when 'baza' then app.current_user_role() = 'wlasciciel'
      else case status
        when 'aktywna' then app.current_user_role() = 'wlasciciel' and app.is_site_manager_candidate(manager_id)
        when 'zakonczona' then finished_by = auth.uid()
        else false
      end
    end
  );

-- Kierownik może zamknąć swoją budowę, ale jej adresu i pinezki przy tym nie zmienia (jak kierownika).
create or replace function app.check_site_finish() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.manager_id is distinct from old.manager_id then
    raise exception 'Przy zamknięciu budowy % nie zmienia się kierownika', old.id;
  end if;
  if (new.address, new.latitude, new.longitude) is distinct from (old.address, old.latitude, old.longitude) then
    raise exception 'Przy zamknięciu budowy % nie zmienia się adresu ani położenia', old.id;
  end if;
  if exists (select 1 from app.tools t where t.location_id = new.id and t.state = 'w_obiegu') then
    raise exception 'Na budowie % zostały narzędzia w obiegu', old.id using errcode = 'GP409';
  end if;
  return new;
end
$$;
