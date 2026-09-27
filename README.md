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
npm run eval:interpretation   # zestaw ewaluacyjny interpretacji na prawdziwym OpenAI, ręcznie, nie w CI
```

**Testy Rejestru** (`src/registry/*.test.ts`) wywołują Rejestr „jako użytkownik X z firmy Y w chwili T”
na prawdziwym Postgresie z włączonym RLS, z ręcznie ustawianym zegarem i czystą bazą przed każdym testem.
Harness jest w `src/registry/testing/harness.ts`.

- Domyślnie baza to PGlite (Postgres w WASM) w pamięci, z nakładką imitującą to, co daje Supabase
  (`auth.users`, `auth.uid()`, rola `authenticated`). Docker nie jest potrzebny.
- Z `REGISTRY_TEST_DATABASE_URL` te same testy idą na wskazany Postgres z Supabase. Harness **czyści
  wszystkie tabele** przed każdym testem, więc wskazuj tu tylko lokalne Supabase
  (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), nigdy projekt w chmurze.

**Zestaw ewaluacyjny interpretacji** (`src/interpretation/eval/`) sprawdza, jak prawdziwy model rozumie
budowlaną polszczyznę (slang, liczebniki, przeniesienia, serwis). Uruchamiaj go przy zmianie modelu albo promptu;
opis i dokładanie przypadków z nagraniami: `src/interpretation/eval/README.md`.

CI (`.github/workflows/ci.yml`) uruchamia lint, typecheck, testy Rejestru na PGlite i na lokalnym
Supabase oraz test dymny na zbudowanej aplikacji.

## Architektura w skrócie

- `src/registry/`: moduł **Rejestr**, przez który przechodzi każdy zapis i odczyt domeny. Dostaje porty:
  bazę (`Db`), zegar (`Clock`) i konta logowania (`AuthAdmin`).
- Dane domeny są w schemacie `app`, którego PostgREST nie wystawia. Rejestr łączy się z bazą
  bezpośrednio (`DATABASE_URL`) i na czas transakcji przyjmuje rolę `authenticated` z JWT aktora,
  więc izolację firm wymusza RLS w bazie, a nie filtr w aplikacji.
- `src/stickers/`: PDF z naklejkami QR (arkusze A4, czcionki OFL w `fonts/`). Kod QR zawiera adres
  `APP_URL/narzedzia/<id>` z losowym identyfikatorem narzędzia; na produkcji ustaw `APP_URL`, żeby naklejki nie
  wskazywały adresu podglądu.
- `messages/pl.json`: wszystkie teksty interfejsu (`t()` z `src/i18n/t.ts`).
- Bieżąca lokalizacja narzędzia to projekcja historii ruchów, zapisywana w tej samej transakcji co ruch.
  Historia (`app.movements`) tylko się dopisuje, czego pilnuje też wyzwalacz w bazie. Wartość narzędzia
  leży w osobnej tabeli `app.tool_values`, którą RLS pokazuje tylko właścicielowi.
- Kod narzędzia przy dodawaniu nadaje Rejestr: prefiks kategorii i kolejny wolny numer (np. `H-05`).
  Alarm „za długo na budowie” liczy dni od ostatniego ruchu względem jednego progu firmy, który
  właściciel ustawia w Ustawieniach (`/ustawienia`).
- `src/app/`: logowanie (`/logowanie`), wymuszona zmiana hasła tymczasowego (`/zmien-haslo`),
  reset hasła przez e-mail (`/reset-hasla` → link → `/auth/confirm` → `/nowe-haslo`),
  tablica „Gdzie jest co” (`/`), karta narzędzia z edycją (`/narzedzia/<id>`) i ustawienia właściciela
  (`/ustawienia`, kółko zębate w nagłówku). Tablica to codzienna praca: panel operacji (checklisty
  „Wydaj z bazy” i „Zwróć na bazę”, dodawanie narzędzia), baza i budowy z listą narzędzi, ostatnie ruchy,
  a dla właściciela także dodawanie budowy i zmiana kierownika. Na komputerze panel operacji i ostatnie
  ruchy stoją po lewej, na telefonie operacje są nad tablicą. W ustawieniach są próg alarmu, naklejki QR,
  serwisy, zespół i zakończone budowy.
- Naklejki QR (`/naklejki`, tylko właściciel): PDF dla wszystkich nieoklejonych albo wybranych narzędzi
  na jednym z arkuszy A4, od wskazanej wolnej naklejki; dodruk jednej naklejki jest na karcie narzędzia.
  Druk zapisuje się w Rejestrze w tej samej transakcji, w której powstaje plik, a zmiana kodu narzędzia
  unieważnia jego naklejkę.
- Import z Excela lub CSV (`/narzedzia/import`, tylko właściciel): moduł `src/import/` czyta w przeglądarce
  pierwszy arkusz XLSX albo CSV (UTF-8 lub Windows-1250) i podpowiada mapowanie kolumn na pola karty po
  nagłówkach. Rejestr robi podgląd (`previewToolImport`: błędy każdego wiersza, kody nadane wierszom bez kodu
  według kategorii, nic nie zapisuje) i zatwierdzenie (`importTools`): jedna transakcja, wszystko albo nic,
  z identyfikatorem operacji klienta (`app.tool_imports`). Każde narzędzie dostaje ruch `przyjecie` ze źródłem
  `import` do lokalizacji z pliku (baza, aktywna budowa, serwis), a bez niej na bazę.
- Tablica (`whereIsWhat`): baza z „nieużywane X dni”, aktywne budowy z alarmem po progu dni firmy,
  sekcje „W serwisie” i „Zaginione” oraz liczba alarmów. Wartości narzędzi, sumy lokalizacji, kwotę
  poza bazą (tylko budowy) i sumę zaginionych dostaje wyłącznie właściciel: dla innych ról zapytanie
  nie czyta tabeli wartości.
- Ruchy: polecenie Rejestru `registerMovement` (wydanie, zwrot) niesie identyfikator operacji klienta
  (ponowne wysłanie zwraca pierwotny ruch) i oczekiwaną lokalizację źródłową narzędzi. Gdy któreś
  narzędzie jest gdzie indziej, cały ruch jest odrzucany (`MovementConflictError`: gdzie jest i kto je
  przeniósł). Kierownik wydaje tylko na swoją budowę i zwraca tylko ze swojej, czego pilnuje też RLS.
  Bieżącą lokalizację przesuwa wyzwalacz przy dopisaniu narzędzia do ruchu; jeśli narzędzia nie ma
  w lokalizacji źródłowej, cała transakcja się wycofuje. „Od X dni” liczy się od czasu zdarzenia
  ostatniego ruchu.
- Cofnięcie i korekta bez edycji historii: autor cofa własne wydanie lub zwrot (`undoMovement`) w ciągu 15 minut
  od czasu zapisu, jeśli żadne z narzędzi nie ruszyło się później. Cofnięcie to nowy ruch z odnośnikiem
  do oryginału, który przez to jest „cofnięty”; narzędzia wracają z „od X dni” sprzed cofniętego ruchu.
  Właściciel robi korektę (`correctTool`: faktyczna lokalizacja i stan, powód obowiązkowy), oznacza
  zaginięcie (`markToolLost`: data, ostatnia lokalizacja i kierownik budowy) i wycofuje narzędzie
  (`retireTool`). Zaginione i wycofane znikają z tablicy i checklist, karta z historią zostaje;
  odnalezienie to korekta. Ruchów nie da się zmienić ani usunąć, także z pominięciem Rejestru.
- Zgłoszenia narzędzi: kierownik zgłasza sprzęt kupiony na swoją budowę (`reportTool`: nazwa i kategoria,
  kod nadaje Rejestr). Narzędzie od razu jest na tej budowie ze statusem ewidencji `zgloszone` i ruchem
  „przyjęcie” autorstwa kierownika, a na tablicy ma znacznik „zgłoszone” i jeździ jak każde inne. Właściciel
  widzi listę zgłoszeń na tablicy (`toolReports`) i akceptuje je z ostatecznym kodem, kategorią i wartością
  (`acceptToolReport`) albo odrzuca z komentarzem (`rejectToolReport`: wycofanie z komentarzem jako powodem,
  historia zostaje). Osobne polityki RLS pozwalają kierownikowi dopisać tylko zgłoszone narzędzie na własną
  budowę, przyjęcie obejmuje tylko narzędzie dopisane w tej samej transakcji, a status ewidencji zmienia
  tylko właściciel.
- Wpis tekstem (przycisk „Wpisz tekstem” w operacjach): moduł **Interpretacja** (`src/interpretation/`) zamienia
  zdanie kierownika w Propozycję ruchu. Port interpretacji (OpenAI Responses API ze strukturalnym wyjściem, zob.
  `docs/adr/0005`) dostaje tekst, narzędzia firmy z zapytania Rejestru `toolCatalog` (kod, nazwa, kategoria,
  lokalizacja, bez wartości) i aktywne budowy, a zwraca rodzaj ruchu, budowę i wspomniane narzędzia z kodami
  wszystkich pasujących. Moduł sam wybiera egzemplarze dostępne tam, skąd ruch zabiera sprzęt: liczebnik bierze
  tyle, ile trzeba, nadmiar kandydatów to pytanie z przyciskami, a brak to nierozpoznana fraza. Propozycję
  kierownik poprawia (rodzaj, budowa, narzędzia) i zatwierdza ✓; moduł nigdy nie zapisuje, a ✓ to zwykłe
  `registerMovement` ze źródłem `glos` i tekstem wpisu, który widać w historii i eksporcie.
- Głos (przycisk „Powiedz lub wpisz”, gdy jest dostawca transkrypcji): kierownik przytrzymuje „Przytrzymaj i mów”
  (MediaRecorder: webm/Opus na Androidzie, mp4 na iPhonie, najwyżej minuta), a nagranie idzie do akcji serwera.
  `proposeFromRecording` modułu Interpretacja kładzie je do prywatnego kubełka Supabase Storage `nagrania`
  (port kubełka nagrań), przekazuje portowi transkrypcji (gpt-4o-transcribe albo ElevenLabs Scribe, zob.
  `docs/adr/0006`) i w `finally` usuwa, więc nagranie znika także po nieudanej transkrypcji. Rozpoznany tekst
  przechodzi dalej tą samą ścieżką co wpis tekstem. Nagranie bez zasięgu czeka w IndexedDB, a po powrocie sieci
  przechodzi transkrypcję i staje się propozycją do zatwierdzenia w telefonie („🎙 Do zatwierdzenia” w nagłówku),
  z czasem zdarzenia z chwili nagrania (zob. `docs/adr/0009`).
- Dzwonek (🔔 w nagłówku, `/dzwonek`): skrzynka powiadomień każdego użytkownika z licznikiem
  nieprzeczytanych (`app.notifications`, zob. `docs/adr/0007`). Rejestr zapisuje powiadomienie w transakcji
  zdarzenia, a port powiadomień wysyła po zapisie kopię e-mailem. Rodzaje: zabrany sprzęt (kierownik budowy,
  z której przeniesienie zabrało narzędzia) i przekroczenie progu dni (zadanie dzienne
  `system().notifyExceededThresholds`: kierownik budowy o każdym narzędziu, właściciel zbiorczo).
- Kolejka offline (`src/lib/offline/`, zob. `docs/adr/0008`): bez zasięgu checklista, skaner i propozycja
  wkładają ruch do IndexedDB z czasem zdarzenia z tej chwili. Nagłówek pokazuje „Oczekuje: N” i wysyła kolejkę
  po kolei, gdy wróci sieć (`registerQueuedMovement`). Ruch, którego serwer nie przyjmie, trafia na listę
  „Do wyjaśnienia” (`/do-wyjasnienia`, `app.rejected_movements`) z powodem i do dzwonka autora.
- Instalowalna PWA (`src/app/manifest.ts`, `public/sw.js`, zob. `docs/adr/0010`): aplikację dodaje się do
  ekranu głównego Androida i iPhone'a (ikony w `public/icons`, rysuje je `npx tsx scripts/generate-icons.mts`).
  Service worker trzyma w telefonie pliki interfejsu, stronę „Brak sieci” i ostatnio pobraną tablicę tej
  osoby; bez zasięgu tablica otwiera się z kopii z informacją, z której godziny są dane. Wylogowanie kasuje
  kopię. Pełne otwarcie strony bez sieci działa tylko w zbudowanej aplikacji (`next dev` nie ożywia strony
  bez połączenia z HMR).
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
- Powiadomienia e-mail (np. „Adam Nowak zabiera S-01 z budowy Rataje” dla kierownika, któremu przeniesienie
  zabrało sprzęt) wysyła Resend: `RESEND_API_KEY` i `NOTIFICATIONS_FROM` (adres w domenie zweryfikowanej
  w Resend) w zmiennych Vercel. Bez klucza powiadomienia trafiają tylko do logu serwera.
- Powiadomienia push (kopia każdego nowego wpisu w dzwonku, zob. `docs/adr/0011`) wymagają pary kluczy VAPID
  (`npx web-push generate-vapid-keys`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `VAPID_SUBJECT` (kontakt dla
  usług push, np. `mailto:powiadomienia@gp-engineering.pl`) w zmiennych Vercel. Bez kluczy włączanie powiadomień
  w dzwonku się nie pokazuje, a kopie push trafiają tylko do logu serwera. Wymiana kluczy unieważnia wszystkie
  subskrypcje.
- Wpis tekstem wymaga `OPENAI_API_KEY` (OpenAI API bez trenowania na danych i bez przechowywania odpowiedzi,
  zob. `docs/adr/0005`) w zmiennych Vercel; model domyślnie `gpt-5.4-mini`, inny w `OPENAI_MODEL`. Bez klucza przycisk „Wpisz tekstem” się nie pokazuje. Lokalnie i w teście dymnym
  `TEXT_ENTRY_INTERPRETER=slowa` włącza interpretację słowami kluczowymi bez AI.
- Nagrywanie głosu wymaga wpisu tekstem i dostawcy transkrypcji: przy `OPENAI_API_KEY` domyślnie OpenAI
  (`gpt-4o-transcribe`, inny w `OPENAI_TRANSCRIPTION_MODEL`), a z `TRANSCRIPTION_PROVIDER=elevenlabs` ElevenLabs
  Scribe (`ELEVENLABS_API_KEY`, model `scribe_v2`, inny w `ELEVENLABS_MODEL`). Kubełek `nagrania` zakłada
  migracja. Lokalnie i w teście dymnym `TRANSCRIPTION_PROVIDER=staly` z `TRANSCRIPTION_FIXED_TEXT` udaje
  transkrypcję stałym tekstem.
- Zadania harmonogramu: Vercel Cron z `vercel.json` (codziennie o 5:00 UTC `/zadania/progi`) wymaga
  `CRON_SECRET` w zmiennych Vercel; bez niego zadanie odpowiada 401. Lokalnie można je wywołać
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/zadania/progi`.
- Sesje nie mogą wygasać: w Authentication → Sessions zostaw wyłączone „Time-box user sessions”
  i „Inactivity timeout”.
