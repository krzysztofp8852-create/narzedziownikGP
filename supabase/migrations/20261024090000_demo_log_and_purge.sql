-- Stare demo znika w całości, a super-admin ma dziennik demo (ADR 0020).

-- Firma demo, którą zastąpiło nowsze demo. Jej dane usuwa się w całości, także historię, która poza tym tylko się
-- dopisuje. Obecne demo (włączone ostatnio) i zwykłe firmy nie są zastąpionym demo.
create function app.is_retired_demo(p_company_id uuid) returns boolean
language sql stable
as $$
  select exists (
    select 1 from app.companies c
    where c.id = p_company_id
      and c.demo_since is not null
      and c.demo_since < (select max(demo_since) from app.companies)
  )
$$;

-- Historia ruchów, wątki zgłoszeń i czat z supportem dalej tylko się dopisują. Wyjątek: usuwanie całej zastąpionej
-- firmy demo. Użytkownicy nie mają prawa usuwać tych wierszy, więc usuwa je tylko aktor systemowy.
create or replace function app.forbid_history_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and app.is_retired_demo(old.company_id) then
    return old;
  end if;
  raise exception 'Historia ruchów tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

create or replace function app.forbid_comment_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and app.is_retired_demo(old.company_id) then
    return old;
  end if;
  raise exception 'Wątek zgłoszenia tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

create or replace function app.forbid_support_message_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from app.support_threads t where t.user_id = old.thread_id and app.is_retired_demo(t.company_id)
  ) then
    return old;
  end if;
  raise exception 'Czat z supportem tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

-- Dziennik demo: wejścia do ról, otwierane ekrany i polecenia oglądających. Bez kluczy obcych, bo zostaje po usunięciu
-- firmy demo i jej kont. Zapisuje go tylko aktor systemowy, a czyta tylko super-admin.
create table app.demo_events (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  company_id uuid not null,
  -- Wizyta jednej przeglądarki: od wejścia ze strony /demo przez kolejne przełączenia roli.
  visit_id uuid,
  -- Sesja Supabase Auth, w której to się działo (każde wejście do roli to nowa sesja).
  session_id uuid,
  user_id uuid not null,
  role app.user_role not null,
  kind text not null check (kind in ('wejscie', 'strona', 'akcja')),
  -- Wejście: `demo` (strona /demo) albo `pasek` (przełączenie roli). Strona: ścieżka. Akcja: nazwa polecenia Rejestru.
  detail text not null check (length(detail) between 1 and 300),
  -- Urządzenie z nagłówka User-Agent, tylko przy wejściu.
  device text check (device in ('telefon', 'tablet', 'komputer'))
);
create index demo_events_at_idx on app.demo_events (at desc);
create index demo_events_session_idx on app.demo_events (session_id) where kind = 'wejscie';
create index demo_events_user_idx on app.demo_events (user_id, at desc);

alter table app.demo_events enable row level security;
grant select on app.demo_events to authenticated;
create policy demo_events_select on app.demo_events for select to authenticated using (app.is_super_admin());
