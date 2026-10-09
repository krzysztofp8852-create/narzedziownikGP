-- Wylogowanie właściciela po bezczynności (ADR 0044, #147): właściciel włącza je w ustawieniach firmy (15, 30, 60 albo
-- 240 minut; domyślnie wyłączone) i dotyczy tylko kont właściciela. Inne role mają dalej długą sesję i tablicę bez sieci.
--
-- Ostatnią aktywność zapisujemy na sesję Supabase Auth (`session_id` z JWT), bo każda przeglądarka liczy bezczynność
-- osobno. Bezczynność liczy się od najpóźniejszej z chwil: zalogowania, zmiany ustawienia i ostatniej aktywności, więc
-- usunięty stary wiersz nie przedłuża sesji, a zapis ustawienia nikogo od razu nie wyloguje. Wiersz widzi i zmienia
-- tylko jego właściciel; to nie dane firmy, więc nie ma `company_id` i nie trafia do eksportu.

alter table app.companies add column owner_idle_logout_minutes integer
  check (owner_idle_logout_minutes in (15, 30, 60, 240));
-- Kiedy ostatnio zmieniono to ustawienie.
alter table app.companies add column owner_idle_logout_since timestamptz;
grant update (owner_idle_logout_minutes, owner_idle_logout_since) on app.companies to authenticated;

create table app.session_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  last_active_at timestamptz not null,
  primary key (user_id, session_id)
);

alter table app.session_activity enable row level security;
grant select, insert, update, delete on app.session_activity to authenticated;

create policy session_activity_own on app.session_activity for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Zmiana ustawienia trafia do dziennika zmian (ADR 0043).
alter table app.change_log drop constraint change_log_setting_check;
alter table app.change_log add constraint change_log_setting_check check (
  setting in (
    'prog_dni', 'zgloszenia_kierownik', 'zgloszenia_magazynier', 'zgloszenia_magazynier_zamyka', 'koszty_kierownik',
    'wylogowanie_wlasciciela'
  )
);
