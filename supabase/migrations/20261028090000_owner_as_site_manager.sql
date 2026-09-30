-- Właściciel małej firmy sam prowadzi budowy i jeździ busem, więc może być kierownikiem budowy i pojazdu. Magazynier
-- i pracownik nadal nie. Te same zasady sprawdza Rejestr (src/registry/locations.ts).
create or replace function app.is_site_manager_candidate(candidate uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.users u
    where u.user_id = candidate and u.company_id = app.current_company_id() and u.role in ('kierownik', 'wlasciciel') and u.active
  )
$$;
