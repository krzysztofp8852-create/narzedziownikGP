# 0014. Logowanie pracownika nazwą użytkownika przez techniczny adres w Supabase Auth

Data: 2026-09-28 · Status: przyjęta

## Kontekst

Pracownik często nie ma służbowego e-maila (#36), a Supabase Auth loguje e-mailem albo telefonem. Właściciel
nadaje pracownikowi nazwę użytkownika (np. `jan.kowalski`), unikalną w firmie, więc ta sama nazwa może się
powtórzyć w dwóch firmach. Na ekranie logowania nie pytamy o firmę.

## Decyzja

- Konto logowania pracownika bez e-maila ma w Supabase Auth techniczny adres `<losowy uuid>@pracownicy.narzedziownik.gp-engineering.pl`.
  Nie da się go zgadnąć z nazwy użytkownika, nikt go nie widzi i nic na niego nie wysyłamy. W `app.users`
  jest nazwa użytkownika, a e-mail tylko wtedy, gdy osoba go podała. Pracownik z e-mailem ma ten e-mail jako
  adres konta, więc loguje się i nazwą, i e-mailem, a hasło może zresetować linkiem.
- Formularz logowania przyjmuje e-mail albo nazwę użytkownika. `system().signInEmails(login)` zamienia login na
  adresy kont (nazwa użytkownika bez „@”, więc się z e-mailem nie myli). Akcja logowania próbuje ich po kolei
  i wpuszcza na konto, do którego pasuje hasło.
- Adresy kont `signInEmails` czyta w transakcji systemowej wprost z `auth.users` (złączenie z `app.users`),
  a nie przez port `AuthAdmin`: przez API administracyjne każde konto to osobne wywołanie HTTP przed
  logowaniem, a techniczny adres zapisany drugi raz w `app.users` mógłby się rozjechać z kontem.
- Nazwa użytkownika jest tylko u pracownika (ograniczenie w bazie), małymi literami, bez polskich znaków,
  unikalna w firmie (indeks).

## Konsekwencje

- Przy tej samej nazwie w kilku firmach jedno logowanie to kilka prób w Supabase Auth, co przybliża limit
  logowań. Przy małych firmach to rzadkie.
- Pracownik bez e-maila nie zresetuje hasła sam: robi to właściciel (nowe hasło tymczasowe, jak u kierownika).
- Lista adresów dla nazwy użytkownika nie wychodzi poza serwer, a zła nazwa i złe hasło dają ten sam komunikat.
