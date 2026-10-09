-- Dziennik zmian kont i ustawień firmy (ADR 0043): kto i kiedy założył firmę albo konto (z rolą i loginem),
-- dezaktywował konto albo osobę bez konta, nadał innej osobie hasło tymczasowe albo zmienił ustawienie firmy (próg
-- dni, kto widzi i zamyka zgłoszenia, czy kierownik widzi koszty), z poprzednią i nową wartością.
--
-- Wpis zapisuje Rejestr w transakcji polecenia, więc nieudane polecenie nie zostawia wpisu. Autora ustala baza z JWT
-- transakcji (wyzwalacz przed zapisem), a nie Rejestr: wpis jest zawsze od tego, kto naprawdę wykonał polecenie.
-- Imiona i nazwiska są kopią z chwili zmiany, bez kluczy obcych do kont i osób. Wpisy tylko się dopisują, jak historia
-- ruchów, i znikają tylko z całą firmą. Czyta je właściciel firmy i super-admin.
create table app.change_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references app.companies (id) on delete restrict,
  at timestamptz not null,
  -- Kto zmienił: osoba z firmy, super-admin albo program (skrypt, transakcja systemowa).
  actor_kind text not null check (actor_kind in ('osoba', 'super_admin', 'system')),
  -- Konto osoby z firmy. Konto super-admina nie jest danymi firmy (trafiłoby do jej eksportu), więc go nie zapisujemy.
  actor_id uuid,
  -- Imię i nazwisko osoby, która zmieniła; puste u super-admina i programu.
  actor_name text,
  kind text not null check (
    kind in ('firma_zalozona', 'konto_zalozone', 'konto_dezaktywowane', 'osoba_dezaktywowana', 'haslo_zresetowane', 'ustawienie_zmienione')
  ),
  -- Osoba, której dotyczy zmiana konta albo osoby.
  person_name text,
  -- Rola i login (e-mail albo nazwa użytkownika) zakładanego konta.
  role app.user_role,
  login text,
  setting text check (
    setting in ('prog_dni', 'zgloszenia_kierownik', 'zgloszenia_magazynier', 'zgloszenia_magazynier_zamyka', 'koszty_kierownik')
  ),
  old_value text,
  new_value text,
  check ((kind = 'ustawienie_zmienione') = (setting is not null)),
  check ((kind = 'ustawienie_zmienione') = (person_name is null))
);
create index change_log_company_id_idx on app.change_log (company_id, id);

alter table app.change_log enable row level security;
grant select, insert on app.change_log to authenticated;

create policy change_log_select on app.change_log for select to authenticated
  using ((company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel') or app.is_super_admin());
create policy change_log_insert on app.change_log for insert to authenticated
  with check ((company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel') or app.is_super_admin());

-- Autor wpisu z JWT transakcji: transakcja bez aktora to program. SECURITY DEFINER, żeby imię i nazwisko autora nie
-- zależało od tego, co wpisujący widzi przez RLS.
create function app.stamp_change_actor() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.actor_id := null;
  new.actor_name := null;
  if auth.uid() is null then
    new.actor_kind := 'system';
  elsif app.is_super_admin() then
    new.actor_kind := 'super_admin';
  else
    new.actor_kind := 'osoba';
    new.actor_id := auth.uid();
    new.actor_name := (select u.full_name from app.users u where u.user_id = auth.uid());
  end if;
  return new;
end
$$;
revoke execute on function app.stamp_change_actor() from public;

create trigger change_log_actor before insert on app.change_log
  for each row execute function app.stamp_change_actor();
create trigger change_log_append_only before update or delete on app.change_log
  for each row execute function app.forbid_history_change();
