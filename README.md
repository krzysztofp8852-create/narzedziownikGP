# NarzędziownikGP

Ewidencja i monitorowanie narzędzi dla małych firm budowlanych (produkt GP Engineering).
Specyfikacja MVP: issue #1.

Stos: Next.js 16 (App Router, TypeScript), Supabase (Postgres z RLS, Auth), Vercel (`fra1`).

## Uruchomienie lokalne

Wymagania: Node.js 24. Do lokalnego Supabase potrzebny jest też Docker (Docker Desktop lub OrbStack).

```bash
npm install
cp .env.example .env.local
```

### Wariant A: lokalne Supabase (Docker)

```bash
npm run db:start
```

To jedno polecenie uruchamia Postgres, Auth i resztę Supabase w Dockerze i wgrywa migracje
z `supabase/migrations`. Po starcie wpisz do `.env.local` wartości z `npx supabase status -o env`:
`API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`, `DB_URL` → `DATABASE_URL`.

`npm run db:reset` odtwarza bazę od zera, a `npm run db:stop` zatrzymuje Supabase.

### Wariant B: projekt testowy Supabase w chmurze (bez Dockera)

Wpisz do `.env.local` klucze projektu `narzedziownik-test` i wgraj migracje:

```bash
npm run db:push
```

### Firma, właściciel i aplikacja

```bash
npm run company:create -- --name "Zawbud" --owner-email jan@zawbud.pl --owner-name "Jan Kowalski"
npm run dev
```

Skrypt zakłada firmę z bazą i kontem właściciela, a na końcu wypisuje hasło tymczasowe.
Właściciel loguje się nim na http://localhost:3000 i przy pierwszym logowaniu musi ustawić własne hasło.

## Testy

```bash
npm test            # testy Rejestru
npm run test:e2e    # test dymny Playwright (potrzebuje .env.local i działającego Supabase)
npm run typecheck
npm run lint
```

**Testy Rejestru** (`src/registry/*.test.ts`) wywołują Rejestr „jako użytkownik X z firmy Y w chwili T”
na prawdziwym Postgresie z włączonym RLS, z ręcznie ustawianym zegarem i czystą bazą przed każdym testem.
Harness jest w `src/registry/testing/harness.ts`.

- Domyślnie baza to PGlite (Postgres w WASM) w pamięci, z nakładką imitującą to, co daje Supabase
  (`auth.users`, `auth.uid()`, rola `authenticated`). Docker nie jest potrzebny.
- Z `REGISTRY_TEST_DATABASE_URL` te same testy idą na wskazany Postgres z Supabase. Harness **czyści
  wszystkie tabele** przed każdym testem, więc wskazuj tu tylko lokalne Supabase
  (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), nigdy projekt w chmurze.

CI (`.github/workflows/ci.yml`) uruchamia lint, typecheck, testy Rejestru na PGlite i na lokalnym
Supabase oraz test dymny na zbudowanej aplikacji.

## Architektura w skrócie

- `src/registry/`: moduł **Rejestr**, przez który przechodzi każdy zapis i odczyt domeny. Dostaje porty:
  bazę (`Db`), zegar (`Clock`) i konta logowania (`AuthAdmin`).
- Dane domeny są w schemacie `app`, którego PostgREST nie wystawia. Rejestr łączy się z bazą
  bezpośrednio (`DATABASE_URL`) i na czas transakcji przyjmuje rolę `authenticated` z JWT aktora,
  więc izolację firm wymusza RLS w bazie, a nie filtr w aplikacji.
- `messages/pl.json`: wszystkie teksty interfejsu (`t()` z `src/i18n/t.ts`).
- Bieżąca lokalizacja narzędzia to projekcja historii ruchów, zapisywana w tej samej transakcji co ruch.
  Historia (`app.movements`) tylko się dopisuje, czego pilnuje też wyzwalacz w bazie. Wartość narzędzia
  leży w osobnej tabeli `app.tool_values`, którą RLS pokazuje tylko właścicielowi.
- Kod narzędzia przy dodawaniu nadaje Rejestr: prefiks kategorii i kolejny wolny numer (np. `H-05`).
  Alarm „za długo na budowie” liczy dni od ostatniego ruchu względem jednego progu firmy, który
  właściciel ustawia w sekcji Firma na tablicy.
- `src/app/`: logowanie (`/logowanie`), wymuszona zmiana hasła tymczasowego (`/zmien-haslo`),
  reset hasła przez e-mail (`/reset-hasla` → link → `/auth/confirm` → `/nowe-haslo`),
  tablica „Gdzie jest co” (`/`) i karta narzędzia z edycją (`/narzedzia/<id>`). Tablica to jeden
  ekran na wszystko: panel operacji (checklisty „Wydaj z bazy” i „Zwróć na bazę”, dodawanie narzędzia),
  baza i budowy z listą narzędzi, ostatnie ruchy, a dla właściciela także dodawanie budowy, zmiana
  kierownika, serwisy, zespół i próg alarmu. Na komputerze panel operacji stoi obok tablicy, na telefonie nad nią.
- Ruchy: polecenie Rejestru `registerMovement` (wydanie, zwrot) niesie identyfikator operacji klienta
  (ponowne wysłanie zwraca pierwotny ruch) i oczekiwaną lokalizację źródłową narzędzi. Gdy któreś
  narzędzie jest gdzie indziej, cały ruch jest odrzucany (`MovementConflictError`: gdzie jest i kto je
  przeniósł). Kierownik wydaje tylko na swoją budowę i zwraca tylko ze swojej, czego pilnuje też RLS.
  Bieżącą lokalizację przesuwa wyzwalacz przy dopisaniu narzędzia do ruchu; jeśli narzędzia nie ma
  w lokalizacji źródłowej, cała transakcja się wycofuje. „Od X dni” liczy się od czasu zdarzenia
  ostatniego ruchu.
- Lokalizacje: baza (jedna na firmę), budowy (adres, jeden kierownik, status `aktywna`/`zakończona`)
  i serwisy. Dodaje je i zmienia kierownika aktywnej budowy tylko właściciel. Kierownikiem budowy może być tylko
  aktywny kierownik z tej samej firmy, czego pilnuje też RLS. Dezaktywacja kierownika nie odbiera mu
  budowy: tablica oznacza wtedy konto jako dezaktywowane, a właściciel przekazuje budowę komuś innemu.
- Konta kierowników i magazynierów zakłada właściciel na `/zespol` (Rejestr przez API administracyjne
  Supabase) i dostaje hasło tymczasowe do przekazania osobiście. Dezaktywacja zostawia osobę w bazie
  (z historią), odcina ją od danych firmy i blokuje logowanie w Supabase Auth.
  Hasło tymczasowe może zamienić na własne tylko sesja zalogowana po jego nadaniu (czas logowania z `amr`
  w JWT), więc sesja sprzed resetu nie przejmie konta. `/nowe-haslo` działa tylko w sesji z linku z e-maila
  otwartego najwyżej godzinę wcześniej.
- Sesja jest długa: token odświeżania nie wygasa, a proxy (`src/proxy.ts`) odświeża go przy każdym
  żądaniu.

## Środowiska i wdrożenie

- Supabase: jeden projekt w regionie `eu-west-1` dla Preview i Production (zob. `docs/adr/0001`,
  `docs/adr/0002`). Klucze są w `.env.local`, a na Vercel w zmiennych środowiskowych projektu.
- Vercel: funkcje w `fra1` (`vercel.json`). Branch `main` wdraża się na Production, pozostałe na Preview.
- Migracje: `npm run db:push`.
- `DATABASE_URL` wskazuje pulę transakcyjną (port 6543). Połączenie jest szyfrowane, a certyfikat
  serwera weryfikowany głównym CA Supabase (`src/lib/supabase-root-ca.ts`).
- W Supabase wyłącz samodzielną rejestrację (Authentication → Sign In / Providers →
  „Allow new users to sign up”). Konta zakłada wyłącznie serwer.
- Reset hasła przez e-mail wymaga w Supabase:
  - szablonu Authentication → Emails → Reset Password z `supabase/templates/recovery.html`
    (link z `token_hash` działa także w przeglądarce otwartej z aplikacji pocztowej),
  - adresu aplikacji w Authentication → URL Configuration (Site URL, a w Redirect URLs `<adres>/auth/confirm`),
  - własnego SMTP (np. Resend) w Authentication → Emails → SMTP Settings: wbudowana poczta Supabase
    wysyła tylko do członków zespołu projektu i kilka wiadomości na godzinę.
- Sesje nie mogą wygasać: w Authentication → Sessions zostaw wyłączone „Time-box user sessions”
  i „Inactivity timeout”.
