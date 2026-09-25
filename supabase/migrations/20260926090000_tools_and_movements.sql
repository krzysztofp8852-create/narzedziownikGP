-- Kategorie, narzędzia, ich wartości i ruchy (na razie tylko `przyjęcie`).
--
-- Bieżąca lokalizacja narzędzia (tools.location_id, tools.located_since) to
-- projekcja historii ruchów. Rejestr zapisuje ją w tej samej transakcji co ruch.
-- Wartość w złotówkach leży w osobnej tabeli, którą RLS pokazuje tylko
-- właścicielowi, więc dla innych ról nie opuszcza bazy.

create type app.tool_state as enum ('w_obiegu', 'zaginione', 'wycofane');
create type app.tool_registration as enum ('zgloszone', 'zaakceptowane');
create type app.movement_kind as enum ('przyjecie');
create type app.movement_source as enum ('panel');

create function app.current_user_role() returns app.user_role
language sql stable security definer set search_path = ''
as $$
  select u.role from app.users u where u.user_id = auth.uid() and u.active
$$;
revoke execute on function app.current_user_role() from public;
grant execute on function app.current_user_role() to authenticated;

-- Klucze obce (company_id, id) pilnują, żeby rekord nie wskazywał rekordu innej firmy.
alter table app.locations add constraint locations_company_id_id_key unique (company_id, id);

create table app.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  -- Prefiks kodów narzędzi tej kategorii, np. S dla S-01.
  prefix text not null check (prefix ~ '^[A-Z]{1,4}$'),
  created_at timestamptz not null,
  unique (company_id, id),
  constraint categories_prefix_per_company unique (company_id, prefix)
);
create unique index categories_name_per_company on app.categories (company_id, lower(name));

create table app.tools (
  -- Nieprzewidywalny identyfikator: trafi do adresu w kodzie QR.
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and length(code) <= 20),
  name text not null check (length(btrim(name)) > 0),
  category_id uuid not null,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  photo_path text,
  -- Próg dni na budowie nadpisujący próg firmy.
  alarm_threshold_days integer check (alarm_threshold_days > 0),
  state app.tool_state not null default 'w_obiegu',
  registration app.tool_registration not null default 'zaakceptowane',
  location_id uuid not null,
  located_since timestamptz not null,
  created_at timestamptz not null,
  unique (company_id, id),
  constraint tools_code_per_company unique (company_id, code),
  foreign key (company_id, category_id) references app.categories (company_id, id),
  foreign key (company_id, location_id) references app.locations (company_id, id)
);
create index tools_location_id_idx on app.tools (location_id);

create table app.tool_values (
  tool_id uuid primary key,
  company_id uuid not null,
  value numeric(12, 2) not null check (value >= 0),
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);

create table app.movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  kind app.movement_kind not null,
  source app.movement_source not null,
  from_location_id uuid,
  to_location_id uuid,
  author_id uuid not null references app.users (user_id) on delete restrict,
  -- Kiedy to się stało na budowie, i kiedy dotarło na serwer.
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  client_operation_id uuid not null,
  unique (company_id, id),
  constraint movements_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, from_location_id) references app.locations (company_id, id),
  foreign key (company_id, to_location_id) references app.locations (company_id, id)
);

create table app.movement_tools (
  movement_id uuid not null,
  tool_id uuid not null,
  company_id uuid not null,
  primary key (movement_id, tool_id),
  foreign key (company_id, movement_id) references app.movements (company_id, id),
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);
create index movement_tools_tool_id_idx on app.movement_tools (tool_id);

-- Historia tylko się dopisuje: błędy poprawia nowy ruch (korekta, cofnięcie), nie edycja.
create function app.forbid_history_change() returns trigger
language plpgsql
as $$
begin
  raise exception 'Historia ruchów tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;
create trigger movements_append_only before update or delete on app.movements
  for each row execute function app.forbid_history_change();
create trigger movement_tools_append_only before update or delete on app.movement_tools
  for each row execute function app.forbid_history_change();

alter table app.categories enable row level security;
alter table app.tools enable row level security;
alter table app.tool_values enable row level security;
alter table app.movements enable row level security;
alter table app.movement_tools enable row level security;

grant select, insert on app.categories to authenticated;
grant select, insert on app.tools to authenticated;
grant update (code, name, category_id, brand, model, serial_number, purchase_date, photo_path, alarm_threshold_days)
  on app.tools to authenticated;
grant select, insert, update, delete on app.tool_values to authenticated;
grant select, insert on app.movements to authenticated;
grant select, insert on app.movement_tools to authenticated;

create policy categories_select on app.categories for select to authenticated
  using (company_id = app.current_company_id());
create policy categories_insert on app.categories for insert to authenticated
  with check (company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'magazynier'));

create policy tools_select on app.tools for select to authenticated
  using (company_id = app.current_company_id());
create policy tools_insert on app.tools for insert to authenticated
  with check (company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'magazynier'));
create policy tools_update on app.tools for update to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'magazynier'))
  with check (company_id = app.current_company_id());

create policy tool_values_owner on app.tool_values for all to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel')
  with check (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

create policy movements_select on app.movements for select to authenticated
  using (company_id = app.current_company_id());
create policy movements_insert on app.movements for insert to authenticated
  with check (company_id = app.current_company_id() and author_id = auth.uid());

create policy movement_tools_select on app.movement_tools for select to authenticated
  using (company_id = app.current_company_id());
create policy movement_tools_insert on app.movement_tools for insert to authenticated
  with check (company_id = app.current_company_id());
