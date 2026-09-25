-- Zakładanie firm przez super-admina wraca razem z panelem super-admina (#24).
-- Do tego czasu zapisy poza własnym profilem robi tylko aktor systemowy (skrypt),
-- który działa poza RLS, więc `authenticated` nie potrzebuje prawa do insert.

drop policy companies_insert on app.companies;
drop policy users_insert on app.users;
drop policy locations_insert on app.locations;

revoke insert on app.companies from authenticated;
revoke insert on app.users from authenticated;
revoke insert on app.locations from authenticated;
