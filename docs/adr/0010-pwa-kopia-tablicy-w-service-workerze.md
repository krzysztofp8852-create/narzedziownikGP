# 0010. PWA: własny service worker trzyma HTML tablicy tej osoby i pliki interfejsu

Data: 2026-09-27 · Status: przyjęta (znosi ograniczenie z konsekwencji ADR 0008: strona otwarta bez sieci się wczytuje)

## Kontekst

Kierownik dodaje aplikację do ekranu głównego telefonu i otwiera ją jak zwykłą aplikację (#18). Bez zasięgu
ma zobaczyć ostatnio pobrany stan „Gdzie jest co” z godziną pobrania, a kolejka offline (ADR 0008, 0009)
ma działać także wtedy, gdy aplikację otwarto już bez sieci. Wartości sprzętu w złotówkach widzi tylko
właściciel, więc w pamięci telefonu kierownika też nie mogą się znaleźć.

## Decyzja

- Manifest z `src/app/manifest.ts` (nazwa NarzędziownikGP, ikony 192/512 i „maskable”), ikona dla iPhone'a
  i `appleWebApp` w metadanych. Manifest, `sw.js` i `/offline` są dostępne bez sesji.
- Własny service worker w `public/sw.js`, bez biblioteki (Serwist): potrzebujemy trzech prostych zasad,
  a testy (`src/lib/offline/service-worker.test.ts`) uruchamiają ten sam plik w udawanym środowisku.
  - Pliki `/_next/static/` z pamięci (mają skrót treści w nazwie); pod `next dev` najpierw z sieci.
  - Pełne otwarcie tablicy (`/`): z sieci, a bez niej albo po 5 s czekania kopia z Cache Storage
    (`ngp-tablica`). Spóźniona odpowiedź zastępuje kopię na następny raz.
  - Inne strony tylko z sieci; bez niej statyczna strona „Brak sieci” z odnośnikiem do tablicy.
- Kopią jest HTML tablicy wyrenderowany przez serwer dla tej osoby, więc kopia kierownika nie ma wartości,
  a strona z kopii ożywa i pozwala zapisywać ruchy do kolejki offline. Serwer zapisuje w nim chwilę
  pobrania (`data-fetched-at`); strona pokazuje ją, gdy przeglądarka nie ma sieci albo gdy service worker
  potwierdzi, że podał kopię (słaby zasięg), i po powrocie sieci odświeża dane.
- Po zalogowaniu, odświeżeniu czy przejściu w aplikacji dane tablicy przychodzą bez pełnego otwarcia, więc
  strona zgłasza service workerowi swój `fetchedAt`, a on, gdy kopia jest starsza, pobiera tablicę jeszcze raz
  w tle (w sesji tej samej osoby) razem z plikami, które strona już pobrała.
- Kopia jednej osoby nie trafia do następnej: wylogowanie kasuje ją przed wysłaniem akcji, strona logowania
  (widać ją tylko bez sesji) przy otwarciu, a service worker, gdy otwarcie tablicy kończy się przekierowaniem
  (koniec sesji, zablokowane konto) albo stroną bez tablicy (strona o programie bez sesji, ADR 0021).
- Nową kopię zapisujemy dopiero, gdy w telefonie są wszystkie pliki, do których odsyła; inaczej zostaje stara.
  Po nowym wdrożeniu (inne pliki w HTML tablicy) service worker usuwa pliki, których nie używa nowa tablica ani
  strona „Brak sieci”, żeby pamięć telefonu nie rosła. Aplikacja prosi o trwałą pamięć
  (`navigator.storage.persist`), żeby przeglądarka nie skasowała kolejki offline przy braku miejsca.

## Konsekwencje

- Bez sieci działa tylko tablica; karty narzędzi, historia i inne strony pokazują „Brak sieci”.
- Tablica z kopii nie wie o ruchach z kolejki (jak w ADR 0008) ani o zmianach po chwili pobrania.
- Każde odświeżenie tablicy w aplikacji to jedno dodatkowe renderowanie `/` w tle.
- To, że strona przyszła z kopii, service worker pamięta tylko do swojego zatrzymania; jeśli przeglądarka go
  zatrzyma przed pytaniem strony (rzadko, sekundy po otwarciu), przy „sieci” bez zasięgu godzina kopii się
  nie pokaże, dopóki przeglądarka nie zgłosi braku sieci.
- `short_name` to pełna nazwa NarzędziownikGP; niektóre ekrany główne Androida ją skrócą.
- Na iPhonie aplikacja z ekranu głównego ma osobną pamięć niż Safari, więc po instalacji trzeba się
  zalogować jeszcze raz.
- `next dev` nie ożywia strony otwartej bez sieci, więc test dymny pełnego otwarcia bez sieci idzie tylko na
  zbudowanej aplikacji (w CI).
