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
  bazę (`Db`), zegar (`Clock`), konta logowania (`AuthAdmin`) i magazyn zdjęć narzędzi (`PhotoStore`).
- Dane domeny są w schemacie `app`, którego PostgREST nie wystawia. Rejestr łączy się z bazą
  bezpośrednio (`DATABASE_URL`) i na czas transakcji przyjmuje rolę `authenticated` z JWT aktora,
  więc izolację firm wymusza RLS w bazie, a nie filtr w aplikacji.
- `messages/pl.json`: wszystkie teksty interfejsu (`t()` z `src/i18n/t.ts`).
- Bieżąca lokalizacja narzędzia to projekcja historii ruchów, zapisywana w tej samej transakcji co ruch.
  Historia (`app.movements`) tylko się dopisuje, czego pilnuje też wyzwalacz w bazie. Wartość narzędzia
  leży w osobnej tabeli `app.tool_values`, którą RLS pokazuje tylko właścicielowi.
- Zdjęcia narzędzi są w prywatnym kubełku Supabase Storage `tool-photos` (zakłada się sam przy pierwszym
  zdjęciu). Przeglądarka nie ma do niego dostępu; serwer wydaje krótko ważne adresy tylko z karty narzędzia,
  którą Rejestr pokazał użytkownikowi jego firmy.
- `src/app/`: logowanie (`/logowanie`), wymuszona zmiana hasła tymczasowego (`/zmien-haslo`),
  tablica „Gdzie jest co” (`/`), dodawanie narzędzia (`/narzedzia/nowe`), karta narzędzia
  (`/narzedzia/<id>`) i jej edycja (`/narzedzia/<id>/edycja`).

## Środowiska i wdrożenie

- Supabase: jeden projekt w regionie `eu-west-1` dla Preview i Production (zob. `docs/adr/0001`,
  `docs/adr/0002`). Klucze są w `.env.local`, a na Vercel w zmiennych środowiskowych projektu.
- Vercel: funkcje w `fra1` (`vercel.json`). Branch `main` wdraża się na Production, pozostałe na Preview.
- Migracje: `npm run db:push`.
- `DATABASE_URL` wskazuje pulę transakcyjną (port 6543). Połączenie jest szyfrowane, a certyfikat
  serwera weryfikowany głównym CA Supabase (`src/lib/supabase-root-ca.ts`).
- W Supabase wyłącz samodzielną rejestrację (Authentication → Sign In / Providers →
  „Allow new users to sign up”). Konta zakłada wyłącznie serwer.
