-- Samouczek dla nowych użytkowników (#32): właściciel, kierownik i magazynier dostają go po pierwszym logowaniu.
-- Brak wartości to samouczek, który jeszcze się nie zamknął, więc startuje sam. Po pominięciu albo ukończeniu
-- nie wraca sam, ale można go otworzyć ponownie. Stan jest per osoba, w bazie, a nie tylko w przeglądarce.
alter table app.users add column tutorial text check (tutorial in ('ukonczony', 'pominiety'));

-- Własny wiersz zmienia każdy przez users_update_self. Właściciel dzięki users_update_by_owner mógłby ją zmienić
-- tylko osobie z hasłem tymczasowym (przed jej pierwszym logowaniem); Rejestr tego nie robi.
grant update (tutorial) on app.users to authenticated;

-- Kto już zmienił hasło tymczasowe, ma pierwsze logowanie za sobą: samouczek nie włączy mu się sam.
update app.users set tutorial = 'pominiety' where not must_change_password;
