-- Anonimizacja osoby (#125, ADR 0045): na prośbę osoby właściciel jej firmy albo super-admin zastępuje jej imię
-- i nazwisko nazwą zastępczą („Osoba zanonimizowana 3”), usuwa notatkę, uprawnienia z dokumentami, e-mail i login,
-- subskrypcje push, czat z supportem, dzwonek i konto logowania, a osoba staje się nieaktywna. Ruchy, zgłoszenia,
-- odbicia i dziennik zmian zostają i pokazują nazwę zastępczą. Anonimizacji nie da się cofnąć.
--
-- Anonimizuje Rejestr w transakcji systemowej, która sama sprawdza, czy aktor jest właścicielem tej firmy albo
-- super-adminem (jak usunięcie firmy). Użytkownicy nie mają praw do tych zmian, więc wyzwalacze poniżej są ostatnią
-- linią obrony tego, że historia dalej tylko się dopisuje.

alter table app.people add column anonymized_at timestamptz;
alter table app.people add constraint people_anonymized check (anonymized_at is null or (not active and note is null));

-- Konto zanonimizowanej osoby zostaje jako autor jej ruchów, zgłoszeń i odbić, ale bez e-maila i loginu.
alter table app.users add column anonymized_at timestamptz;
alter table app.users drop constraint users_username_only_worker, drop constraint users_email_unless_worker;
alter table app.users
  add constraint users_username_only_worker check ((role = 'pracownik') = (username is not null) or anonymized_at is not null),
  add constraint users_email_unless_worker check (role = 'pracownik' or email is not null or anonymized_at is not null),
  add constraint users_anonymized check (anonymized_at is null or (not active and email is null and username is null));

-- Konto logowania (Supabase Auth) zanonimizowanej osoby znika po transakcji, a wiersz konta w `app.users` zostaje,
-- bo wskazuje go historia. Dlatego bez klucza obcego do `auth.users`.
alter table app.users drop constraint users_user_id_fkey;

-- Osoba, której dotyczy wpis dziennika zmian, żeby anonimizacja znalazła jej wpisy także sprzed zmiany imienia
-- i nazwiska. Bez klucza obcego: wpis zostaje taki, jaki był (ADR 0043), a znika tylko z całą firmą.
alter table app.change_log add column person_id uuid;

-- Dotychczasowe wpisy: po loginie zakładanego konta, a bez niego po imieniu i nazwisku, gdy w firmie jest dokładnie
-- jedna taka osoba. Wpis, którego osoby nie da się ustalić, zostaje bez niej. Na czas uzupełnienia bez wyzwalacza,
-- który niżej wraca w nowej postaci.
drop trigger change_log_append_only on app.change_log;

update app.change_log c set person_id = p.id
from app.users u join app.people p on p.user_id = u.user_id
where c.login is not null and u.company_id = c.company_id and c.login in (u.email, u.username);

update app.change_log c set person_id = (select p.id from app.people p where p.company_id = c.company_id and p.full_name = c.person_name)
where c.person_id is null and c.person_name is not null
  and (select count(*) from app.people p where p.company_id = c.company_id and p.full_name = c.person_name) = 1;

alter table app.change_log drop constraint change_log_kind_check;
alter table app.change_log add constraint change_log_kind_check check (
  kind in (
    'firma_zalozona', 'konto_zalozone', 'konto_dezaktywowane', 'osoba_dezaktywowana', 'haslo_zresetowane',
    'ustawienie_zmienione', 'osoba_zanonimizowana'
  )
);

-- Dziennik zmian dalej tylko się dopisuje. Wyjątki: usuwanie całej firmy i anonimizacja, która zamienia imię
-- i nazwisko osoby (także autora) na nazwę zastępczą zanonimizowanej osoby i usuwa login jej konta. Nic innego
-- we wpisie się nie zmienia.
create function app.forbid_change_log_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and app.is_purged_company(old.company_id) then
    return old;
  end if;
  if tg_op = 'UPDATE'
    and to_jsonb(new) - array['person_name', 'login', 'actor_name'] = to_jsonb(old) - array['person_name', 'login', 'actor_name']
    and (
      (new.person_name is not distinct from old.person_name and new.login is not distinct from old.login)
      or (new.login is null and exists (
        select 1 from app.people p where p.id = new.person_id and p.anonymized_at is not null and p.full_name = new.person_name
      ))
    )
    and (
      new.actor_name is not distinct from old.actor_name
      or exists (
        select 1 from app.people p where p.user_id = new.actor_id and p.anonymized_at is not null and p.full_name = new.actor_name
      )
    )
  then
    return new;
  end if;
  raise exception 'Dziennik zmian tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

create trigger change_log_append_only before update or delete on app.change_log
  for each row execute function app.forbid_change_log_change();

-- Czat z supportem dalej tylko się dopisuje. Wyjątki: usuwanie całej firmy i wątek zanonimizowanej osoby, który
-- znika w całości.
create or replace function app.forbid_support_message_change() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from app.support_threads t join app.users u on u.user_id = t.user_id
    where t.user_id = old.thread_id and (app.is_purged_company(t.company_id) or u.anonymized_at is not null)
  ) then
    return old;
  end if;
  raise exception 'Czat z supportem tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;

-- Super-admin widzi osoby firmy, żeby zanonimizować osobę, której prośba przyszła do GP Engineering.
create policy people_select_by_super_admin on app.people for select to authenticated using (app.is_super_admin());
