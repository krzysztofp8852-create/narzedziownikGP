-- Zespół: właściciel dodaje kierowników i magazynierów swojej firmy, generuje im
-- nowe hasło tymczasowe i dezaktywuje konta. Osoby się nie kasuje: dezaktywowana
-- zostaje w app.users (z historią swoich ruchów), ale app.current_company_id()
-- przestaje ją wpuszczać do danych firmy.

-- Kiedy nadano obecne hasło tymczasowe. Zmienić je na własne może tylko sesja
-- zalogowana później, więc sesja sprzed resetu (np. z zgubionego telefonu) nie
-- przejmie konta. Brak daty (konta sprzed tej migracji) nie blokuje zmiany.
alter table app.users add column temporary_password_issued_at timestamptz;

grant insert on app.users to authenticated;
grant update (active, temporary_password_issued_at) on app.users to authenticated;

-- Właściciel dodaje do własnej firmy tylko kierowników i magazynierów, zawsze
-- aktywnych i z hasłem tymczasowym do zmiany.
create policy users_insert_by_owner on app.users for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.current_user_role() = 'wlasciciel'
    and role <> 'wlasciciel'
    and must_change_password
    and active
  );

-- Właściciel resetuje hasło (flaga „wymaga zmiany hasła”) i dezaktywuje konta
-- kierowników i magazynierów własnej firmy, ale nie właściciela. Aktywnej osobie
-- nie może zdjąć wymogu zmiany hasła tymczasowego.
create policy users_update_by_owner on app.users for update to authenticated
  using (
    company_id = app.current_company_id()
    and app.current_user_role() = 'wlasciciel'
    and role <> 'wlasciciel'
  )
  with check (
    company_id = app.current_company_id()
    and role <> 'wlasciciel'
    and (must_change_password or not active)
  );

-- Własny profil można zmieniać tylko jako aktywna osoba i nie można się nim dezaktywować.
drop policy users_update_self on app.users;
create policy users_update_self on app.users for update to authenticated
  using (user_id = auth.uid() and active)
  with check (user_id = auth.uid() and active);
