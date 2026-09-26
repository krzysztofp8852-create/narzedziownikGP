-- Prostsza karta narzędzia: bez daty zakupu, zdjęcia i progu dni narzędzia.
-- Alarm liczy czas na budowie względem jednego progu firmy, który ustawia właściciel.
-- Pliki, które zostały w kubełku Storage `tool-photos`, nie mają już odwołań.

alter table app.tools
  drop column purchase_date,
  drop column photo_path,
  drop column alarm_threshold_days;

grant update (alarm_threshold_days) on app.companies to authenticated;

create policy companies_update_owner on app.companies for update to authenticated
  using (id = app.current_company_id() and app.current_user_role() = 'wlasciciel')
  with check (id = app.current_company_id());
