-- Firma, użytkownicy firmy, super-admini i lokalizacje (baza).
--
-- Dane domeny żyją w schemacie `app`, którego PostgREST nie wystawia. Jedyną
-- drogą do nich jest Rejestr, który łączy się z bazą bezpośrednio i na czas
-- transakcji przełącza się na rolę `authenticated` z JWT aktora. RLS poniżej
-- jest więc ostatnią linią obrony izolacji firm, a nie filtrem w aplikacji.

create schema app;
grant usage on schema app to authenticated;

create type app.user_role as enum ('wlasciciel', 'magazynier', 'kierownik');
create type app.location_kind as enum ('baza', 'budowa', 'serwis');

create table app.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  alarm_threshold_days integer not null default 30 check (alarm_threshold_days > 0),
  created_at timestamptz not null
);

create table app.users (
  user_id uuid primary key references auth.users (id) on delete restrict,
  company_id uuid not null references app.companies (id) on delete restrict,
  role app.user_role not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null
);
create index users_company_id_idx on app.users (company_id);

create table app.super_admins (
  user_id uuid primary key references auth.users (id) on delete restrict,
  created_at timestamptz not null
);

create table app.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  kind app.location_kind not null,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null
);
create index locations_company_id_idx on app.locations (company_id);
-- Każda firma ma dokładnie jedną bazę: zakładanie firmy tworzy ją w tej samej
-- transakcji, a ten indeks nie pozwala na drugą.
create unique index locations_one_base_per_company on app.locations (company_id) where kind = 'baza';

-- Funkcje pomocnicze dla polityk. SECURITY DEFINER, żeby polityka na
-- app.users nie odpytywała rekurencyjnie samej siebie.

create function app.current_company_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.company_id from app.users u where u.user_id = auth.uid() and u.active
$$;

create function app.is_super_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from app.super_admins s where s.user_id = auth.uid())
$$;

revoke execute on function app.current_company_id() from public;
revoke execute on function app.is_super_admin() from public;
grant execute on function app.current_company_id() to authenticated;
grant execute on function app.is_super_admin() to authenticated;

alter table app.companies enable row level security;
alter table app.users enable row level security;
alter table app.super_admins enable row level security;
alter table app.locations enable row level security;

grant select, insert on app.companies to authenticated;
grant select, insert on app.users to authenticated;
grant update (must_change_password) on app.users to authenticated;
grant select, insert on app.locations to authenticated;
-- app.super_admins: brak uprawnień dla `authenticated`; czyta ją tylko app.is_super_admin().

create policy companies_select on app.companies for select to authenticated
  using (id = app.current_company_id() or app.is_super_admin());
create policy companies_insert on app.companies for insert to authenticated
  with check (app.is_super_admin());

create policy users_select on app.users for select to authenticated
  using (company_id = app.current_company_id() or app.is_super_admin());
create policy users_insert on app.users for insert to authenticated
  with check (app.is_super_admin());
create policy users_update_self on app.users for update to authenticated
  using (user_id = auth.uid() and active)
  with check (user_id = auth.uid());

create policy locations_select on app.locations for select to authenticated
  using (company_id = app.current_company_id() or app.is_super_admin());
create policy locations_insert on app.locations for insert to authenticated
  with check (app.is_super_admin());
