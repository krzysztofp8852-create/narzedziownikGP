-- Import narzędzi z pliku. Każdy zatwierdzony import zostawia wpis: kto, kiedy i ile
-- narzędzi. Identyfikator operacji klienta jest unikalny w firmie, więc ponowne
-- wysłanie tego samego importu zwraca pierwotny wynik zamiast dopisać narzędzia drugi raz.
-- Narzędzia z importu dostają zwykłe ruchy `przyjecie` ze źródłem `import`.

create table app.tool_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  client_operation_id uuid not null,
  author_id uuid not null,
  tool_count integer not null check (tool_count > 0),
  created_at timestamptz not null,
  constraint tool_imports_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, author_id) references app.users (company_id, user_id)
);

alter table app.tool_imports enable row level security;
grant select, insert on app.tool_imports to authenticated;

create policy tool_imports_select on app.tool_imports for select to authenticated
  using (company_id = app.current_company_id());
create policy tool_imports_insert on app.tool_imports for insert to authenticated
  with check (company_id = app.current_company_id() and author_id = auth.uid() and app.current_user_role() = 'wlasciciel');
