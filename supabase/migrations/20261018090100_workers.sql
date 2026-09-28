-- Pracownik: widzi, gdzie jest sprzęt, ale nie rejestruje ruchów (polityki ruchów
-- wymieniają role, które je rejestrują, więc pracownika w nich nie ma). Często nie ma
-- służbowego e-maila, więc loguje się nazwą użytkownika nadaną przez właściciela,
-- unikalną w firmie. Konto w Supabase Auth ma wtedy techniczny adres, którego nie
-- zapisujemy w app.users: tu e-mail jest tylko wtedy, gdy osoba go podała.

alter table app.users alter column email drop not null;
alter table app.users add column username text;

alter table app.users
  add constraint users_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  -- Nazwę użytkownika ma pracownik i tylko on; e-mail mają wszyscy poza pracownikiem.
  add constraint users_username_only_worker check ((role = 'pracownik') = (username is not null)),
  add constraint users_email_unless_worker check (role = 'pracownik' or email is not null);

create unique index users_username_per_company on app.users (company_id, username) where username is not null;
