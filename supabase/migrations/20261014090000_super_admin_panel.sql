-- Panel super-admina: abonament firmy i zakładanie firm przez GP Engineering.
--
-- Abonament (próg, „opłacone do”, ręczny tryb tylko do odczytu, dane do faktury) żyje w osobnej
-- tabeli, a nie w app.companies: właściciel może zmieniać swój wiersz firmy (próg alarmu), a polityki
-- RLS działają na wierszach, nie na kolumnach. Abonament zmienia wyłącznie super-admin.

create table app.subscriptions (
  company_id uuid primary key references app.companies (id) on delete restrict,
  -- Progi i ich limity narzędzi zna Rejestr (src/registry/subscriptions.ts).
  tier text not null check (tier in ('maly', 'sredni', 'duzy')),
  -- Ostatni opłacony dzień; null, dopóki nie zaksięgowano pierwszego przelewu.
  paid_until date,
  manual_read_only boolean not null default false,
  -- Dane do faktury; puste u firm założonych skryptem przed panelem.
  invoice_name text check (invoice_name is null or length(btrim(invoice_name)) > 0),
  tax_id text check (tax_id is null or tax_id ~ '^[0-9]{10}$'),
  invoice_address text check (invoice_address is null or length(btrim(invoice_address)) > 0)
);

insert into app.subscriptions (company_id, tier) select id, 'maly' from app.companies;

alter table app.subscriptions enable row level security;

grant select, insert on app.subscriptions to authenticated;
grant update (tier, paid_until, manual_read_only) on app.subscriptions to authenticated;

-- Abonament z danymi do faktury widzi właściciel swojej firmy, a zmienia tylko super-admin.
create policy subscriptions_select on app.subscriptions for select to authenticated
  using ((company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel') or app.is_super_admin());
create policy subscriptions_insert_by_super_admin on app.subscriptions for insert to authenticated
  with check (app.is_super_admin());
create policy subscriptions_update_by_super_admin on app.subscriptions for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- Zakładanie firmy z bazą i właścicielem, cofnięte w 20260925210000 do czasu panelu.
grant insert (name, created_at) on app.companies to authenticated;
create policy companies_insert_by_super_admin on app.companies for insert to authenticated
  with check (app.is_super_admin());
create policy locations_insert_base_by_super_admin on app.locations for insert to authenticated
  with check (app.is_super_admin() and kind = 'baza');
create policy users_insert_owner_by_super_admin on app.users for insert to authenticated
  with check (app.is_super_admin() and role = 'wlasciciel');

-- Liczba narzędzi (bez wycofanych) w każdej firmie. Super-admin nie czyta samych narzędzi,
-- więc dostaje tylko liczby; każdemu innemu funkcja nic nie zwraca.
create function app.company_tool_counts() returns table (company_id uuid, tools bigint)
language sql stable security definer set search_path = ''
as $$
  select t.company_id, count(*) from app.tools t
  where t.state <> 'wycofane' and app.is_super_admin()
  group by t.company_id
$$;

revoke execute on function app.company_tool_counts() from public;
grant execute on function app.company_tool_counts() to authenticated;
