-- Firma demo: przykładowa firma, którą pokazujemy zainteresowanym klientom. Wchodzi się do niej bez hasła
-- ze strony /demo jako dowolna rola. `demo_since`: kiedy firma stała się demo (null: zwykła firma). Obecne
-- demo to to, które włączono ostatnio; poprzednie mają dezaktywowane konta. Ustawia ją tylko skrypt (aktor
-- systemowy): użytkownicy mają do niej wyłącznie odczyt.

alter table app.companies add column demo_since timestamptz;

create index companies_demo_since_idx on app.companies (demo_since desc) where demo_since is not null;
