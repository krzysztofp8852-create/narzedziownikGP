-- Super-admin usuwa firmę w całości na polecenie klienta (ADR 0025, umowa powierzenia § 9).
--
-- Dziennik usuniętych firm: kto i kiedy usunął którą firmę. Zostaje po usunięciu (bez kluczy obcych), żeby można było
-- potwierdzić klientowi wykonanie polecenia. Tylko nazwa, bez NIP-u i danych osób: nazwa wystarcza, żeby wiedzieć, co
-- usunięto. Wpis powstaje w transakcji usunięcia, zanim znikną wiersze firmy, i to on pozwala usunąć historię, która
-- poza tym tylko się dopisuje. Nieudane usunięcie cofa też wpis. Zapisuje go tylko aktor systemowy, a czyta tylko
-- super-admin.
create table app.company_deletions (
  company_id uuid primary key,
  name text not null,
  deleted_at timestamptz not null,
  -- Super-admin, który usunął firmę.
  deleted_by uuid not null
);

alter table app.company_deletions enable row level security;
grant select on app.company_deletions to authenticated;
create policy company_deletions_select on app.company_deletions for select to authenticated using (app.is_super_admin());

-- Firma, której dane usuwa się w całości, także historię: zastąpione demo albo firma usuwana przez super-admina.
-- Bez security definer, jak app.is_retired_demo: usuwa tylko aktor systemowy, a użytkownik i tak nie ma prawa DELETE.
create function app.is_purged_company(p_company_id uuid) returns boolean
language sql stable
as $$
  select app.is_retired_demo(p_company_id)
      or exists (select 1 from app.company_deletions d where d.company_id = p_company_id)
$$;

-- Historia ruchów, wątki zgłoszeń i czat z supportem dalej tylko się dopisują. Wyjątek: usuwanie całej firmy.
-- Użytkownicy nie mają prawa usuwać tych wierszy, więc usuwa je tylko aktor systemowy.
create or replace function app.forbid_history_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and app.is_purged_company(old.company_id) then
    return old;
  end if;
  raise exception 'Historia ruchów tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

create or replace function app.forbid_comment_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and app.is_purged_company(old.company_id) then
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
    select 1 from app.support_threads t where t.user_id = old.thread_id and app.is_purged_company(t.company_id)
  ) then
    return old;
  end if;
  raise exception 'Czat z supportem tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;
