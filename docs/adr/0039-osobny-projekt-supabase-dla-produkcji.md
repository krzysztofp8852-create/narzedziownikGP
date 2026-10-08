# 0039. Osobny projekt Supabase dla produkcji

Data: 2026-10-08 · Status: przyjęta (zastępuje ADR 0002)

## Kontekst

ADR 0002 zostawił jeden projekt Supabase dla produkcji, podglądów Vercel i lokalnych testów dymnych, „do rewizji przed
pierwszym płacącym klientem”. W tym układzie migracja z `npm run db:push` od razu działa na produkcji, a lokalny
`npm run test:e2e` zakłada firmy „Test dymny …” w bazie z danymi klientów. Informatyk klienta zapyta o rozdzielenie
środowisk (#135).

## Decyzja

- **Produkcja ma własny projekt Supabase** `narzedziownik-prod` w `eu-west-1` (ADR 0001), w tej samej organizacji
  Supabase co dotychczasowy. Korzysta z niego tylko Vercel Production (branch `main`, `narzedziownikgp.pl`).
- **Dotychczasowy projekt `narzedziownik-test` zostaje testowym**: Vercel Preview, `.env.local` i lokalny test dymny.
  CI dalej stawia własne, jednorazowe Supabase (`supabase start`).
- **Produkcja startuje pusta**: migracje, konto super-admina i firma demo. Firm i plików z projektu testowego nie
  przenosimy; poza demo są tam tylko firmy testowe.
- **Firma demo żyje na produkcji**, pod `/demo` adresu produkcji, który wysyłamy klientom.
  `.github/workflows/demo.yml` woła `narzedziownikgp.pl/zadania/demo`, więc odświeża demo w bazie produkcyjnej.
  Projekt testowy może mieć własne demo do prób (`npm run demo:create`).
- **Klucze produkcji są tylko w zmiennych Vercel Production i w lokalnym `.env.produkcja`** (poza repo, Next.js go nie
  czyta). Skrypty z końcówką `:prod` (`db:push:prod`, `super-admin:create:prod`, `demo:create:prod`) biorą zmienne
  z tego pliku i bez niego kończą się błędem. Zwykłe skrypty i test dymny dalej czytają `.env.local`.
- Ustawienia Auth (wyłączona rejestracja, szablon resetu hasła, SMTP, URL-e przekierowań) nie są w migracjach, więc
  ustawia się je w panelu każdego projektu. Kreator `scripts/produkcja-supabase.sh` prowadzi przez założenie projektu
  produkcyjnego, przełączenie Vercel i przestawienie starego projektu na testowy.

## Konsekwencje

- Migrację wgrywamy dwa razy: `npm run db:push` na projekt testowy (sprawdzenie na Preview), potem
  `npm run db:push:prod` przed scaleniem kodu do `main`. Migracja wchodzi na produkcję przed kodem, więc musi być
  zgodna wstecz z kodem, który tam działa.
- Lokalny test dymny i Preview nie dotykają danych klientów. Testy zakładające konto super-admina dalej idą tylko w CI,
  żeby nie zostawiać w projekcie testowym kont, których nie da się usunąć z aplikacji.
- Zmianę ustawień Auth (np. nowy szablon e-maila) trzeba powtórzyć w obu projektach.
- Na płatnym planie Supabase każdy projekt ma osobny koszt mocy obliczeniowej.
- Umowę powierzenia (DPA) z Supabase zawiera organizacja, a nie pojedynczy projekt; projekt produkcyjny jest w tej samej
  organizacji. Kreator prosi o sprawdzenie tego w panelu.
- W projekcie testowym zostają dotychczasowe firmy testowe i stare demo. Super-admin usuwa je w panelu, jeśli
  przeszkadzają (ADR 0025).
