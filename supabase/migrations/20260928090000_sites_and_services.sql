-- Budowy i serwisy. Budowa ma adres, jednego kierownika i status; serwis ma
-- tylko nazwę. Dodaje je i zmienia kierownika budowy tylko właściciel.

create type app.site_status as enum ('aktywna', 'zakonczona');

-- Klucz obcy (company_id, manager_id) pilnuje, żeby kierownik był z tej samej firmy.
alter table app.users add constraint users_company_id_user_id_key unique (company_id, user_id);

alter table app.locations
  add column address text,
  add column manager_id uuid,
  add column status app.site_status,
  add foreign key (company_id, manager_id) references app.users (company_id, user_id),
  add constraint locations_site_fields check (
    case kind
      -- `address is not null` wprost: sam `length(btrim(null)) > 0` daje null, a taki CHECK przechodzi.
      when 'budowa' then address is not null and length(btrim(address)) > 0 and manager_id is not null and status is not null
      else address is null and manager_id is null and status is null
    end
  );
create index locations_manager_id_idx on app.locations (manager_id);

-- Kierownikiem budowy może być tylko aktywny kierownik z firmy aktora.
create function app.is_site_manager_candidate(candidate uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.users u
    where u.user_id = candidate and u.company_id = app.current_company_id() and u.role = 'kierownik' and u.active
  )
$$;
revoke execute on function app.is_site_manager_candidate(uuid) from public;
grant execute on function app.is_site_manager_candidate(uuid) to authenticated;

grant insert (company_id, kind, name, address, manager_id, status, created_at) on app.locations to authenticated;
grant update (manager_id) on app.locations to authenticated;

create policy locations_insert_by_owner on app.locations for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.current_user_role() = 'wlasciciel'
    and (
      kind = 'serwis'
      -- Nowa budowa jest zawsze aktywna; zamyka się ją osobnym poleceniem.
      or (kind = 'budowa' and status = 'aktywna' and app.is_site_manager_candidate(manager_id))
    )
  );

create policy locations_update_by_owner on app.locations for update to authenticated
  using (
    company_id = app.current_company_id()
    and app.current_user_role() = 'wlasciciel'
    and kind = 'budowa'
    and status = 'aktywna'
  )
  with check (company_id = app.current_company_id() and app.is_site_manager_candidate(manager_id));
