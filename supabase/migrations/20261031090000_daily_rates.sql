-- Koszt sprzętu: stawki dzienne i historia wartości narzędzi (ADR 0028).
--
-- Stawka dzienna ma trzy poziomy: procent wartości narzędzia dla firmy, procent dla kategorii i kwota zł/dzień dla
-- narzędzia (pierwszeństwo: narzędzie, kategoria, firma). Każdy wpis obowiązuje od dnia zapisu w Polsce; pusty wpis
-- kategorii albo narzędzia zdejmuje nadpisanie. Stawka procentowa zależy od wartości narzędzia z danego dnia, więc
-- wartość też ma historię: każda zmiana app.tool_values dopisuje tu wpis (pusty, gdy wartość usunięto).
--
-- Dzień startu kosztów to dzień pierwszego wpisu stawki firmy. Wpisy stawek i wartości z dnia startu i sprzed niego
-- obowiązują wstecz przez całą historię ruchów, a późniejsze od swojego dnia. Obie tabele tylko się dopisują
-- i widzi je tylko właściciel, jak wartości w zł.

create table app.daily_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  kind text not null check (kind in ('firma', 'kategoria', 'narzedzie')),
  category_id uuid,
  tool_id uuid,
  -- Procent wartości na dzień (firma, kategoria) albo kwota zł/dzień (narzędzie); oba puste zdejmują nadpisanie.
  percent numeric(5, 2) check (percent between 0 and 100),
  amount numeric(12, 2) check (amount >= 0),
  valid_from date not null,
  recorded_at timestamptz not null,
  recorded_by uuid not null,
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint daily_rates_target check (
    (kind = 'firma' and category_id is null and tool_id is null and percent is not null and amount is null)
    or (kind = 'kategoria' and category_id is not null and tool_id is null and amount is null)
    or (kind = 'narzedzie' and tool_id is not null and category_id is null and percent is null)
  ),
  foreign key (company_id, category_id) references app.categories (company_id, id),
  foreign key (company_id, tool_id) references app.tools (company_id, id),
  foreign key (company_id, recorded_by) references app.users (company_id, user_id)
);
create index daily_rates_company_idx on app.daily_rates (company_id, valid_from, sequence_number);

create table app.tool_value_history (
  tool_id uuid not null,
  company_id uuid not null,
  -- Pusta: od tego dnia narzędzie nie ma wartości.
  value numeric(12, 2) check (value >= 0),
  valid_from date not null,
  recorded_at timestamptz not null,
  sequence_number bigint generated always as identity,
  primary key (tool_id, sequence_number),
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);

-- Dotychczasowe wartości jak zapisane w dniu dodania narzędzia; i tak są sprzed dnia startu, więc obowiązują wstecz.
insert into app.tool_value_history (tool_id, company_id, value, valid_from, recorded_at)
select v.tool_id, v.company_id, v.value, (t.created_at at time zone 'Europe/Warsaw')::date, t.created_at
from app.tool_values v join app.tools t on t.id = v.tool_id;

alter table app.daily_rates enable row level security;
alter table app.tool_value_history enable row level security;

grant select, insert on app.daily_rates to authenticated;
grant select, insert on app.tool_value_history to authenticated;

create policy daily_rates_owner_select on app.daily_rates for select to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');
create policy daily_rates_owner_insert on app.daily_rates for insert to authenticated
  with check (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel' and recorded_by = auth.uid());

create policy tool_value_history_owner_select on app.tool_value_history for select to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');
create policy tool_value_history_owner_insert on app.tool_value_history for insert to authenticated
  with check (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');
