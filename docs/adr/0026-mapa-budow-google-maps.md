# 0026. Mapa budów na Google Maps, z geokodowaniem na serwerze; firma demo zostaje przy mapie demo

Data: 2026-10-01 · Status: przyjęta (podmiot umowy Google Maps Platform i jego rolę wobec danych sprawdzić przed pierwszym płacącym klientem)

## Kontekst

Mapa na tablicy (#76) była tylko demo: narysowane tło, pinezki budów w miejscach z hasha identyfikatora
i przykładowy sygnał lokalizatorów. Właściciel prawdziwej firmy widział więc swoje budowy w przypadkowych miejscach.
Budowa ma obowiązkowy adres tekstem, ale bez współrzędnych; baza adresu nie miała.

Do wyboru był dostawca oparty na OpenStreetMap z planem komercyjnym (MapTiler, Geoapify, z serwerami w UE) albo
Google Maps. Adresy budów to często działki („dz. nr 123/4, Kórnik”), a Google geokoduje polskie adresy najlepiej.

## Decyzja

- **Google Maps Platform.** Mapa w przeglądarce to Maps JavaScript API z pinezkami `AdvancedMarkerElement`
  (wymagają identyfikatora mapy `GOOGLE_MAPS_MAP_ID`; bez niego `DEMO_MAP_ID`, tylko do prób). Klucz przeglądarki
  (`GOOGLE_MAPS_BROWSER_KEY`) jest jawny z natury, więc w Google Cloud ograniczamy go do adresów aplikacji
  i samego Maps JavaScript API. Serwer czyta go w czasie działania i podaje stronie, więc zmiana klucza nie wymaga
  budowania od nowa. Bez klucza prawdziwe firmy nie mają mapy na tablicy.
- **Geokodowanie tylko na serwerze**, osobnym kluczem (`GOOGLE_MAPS_SERVER_KEY`, sam Geocoding API), za portem
  `Geocoder` Rejestru (`src/lib/google-geocoder.ts`). Rejestr geokoduje przy założeniu budowy, przy zmianie jej
  adresu i przy zmianie adresu bazy, dopiero po zatwierdzeniu transakcji, która zapisała adres (zapytanie do
  zewnętrznego dostawcy nie trzyma transakcji). Położenie zapisuje się w `app.locations` (`latitude`, `longitude`),
  tylko gdy adres jest wciąż ten sam, a pinezki nikt w międzyczasie nie postawił ręcznie. Tablica nie geokoduje.
  Bierzemy pierwszy wynik Google, także przybliżony (np. sama miejscowość przy działce).
- **Położenie należy do adresu.** Zmiana adresu czyści położenie i geokoduje nowy adres, a ten sam adres niczego nie
  zmienia. Właściciel może przeciągnąć pinezkę albo wskazać miejsce na mapie, a to zostaje do następnej zmiany
  adresu. Nieznaleziony adres (albo dostawca, który nie odpowiada) zostawia budowę bez położenia: budowa powstaje,
  a pod mapą jest na liście „Nie znaleziono adresu”, nie w przypadkowym miejscu. Pilnuje tego też baza danych:
  położenie jest tylko przy adresie, w granicach mapy, a zamykając budowę kierownik nie zmienia ani adresu,
  ani położenia.
- **Baza ma opcjonalny adres** w tym samym wierszu `app.locations` (zmieniony CHECK), ustawiany przez właściciela
  w Ustawieniach. Bez adresu bazy nie ma na mapie.
- Mapę widzi każdy w firmie, tak jak tablicę: bazę z adresem i aktywne budowy. Adresy i pinezki zmienia tylko
  właściciel. Zakończonych budów nie ma na mapie. Pojazdów nie ma, bo nie mają stałego adresu; uczciwie postawi je
  dopiero prawdziwy lokalizator.
- **Bez sieci** (PWA, ADR 0010) mapa mówi, że wymaga połączenia; kafelków nie trzymamy w telefonie. Reszta tablicy
  działa jak dotąd.
- **Firma demo zostaje przy mapie demo** (`DemoSiteMap`): narysowane tło, pinezki z hasha, przykładowe lokalizatory,
  tag „demo”. Demo nie pyta Google ani przy oglądaniu, ani przy zakładaniu (`createDemoCompany` dostaje
  `noGeocoder`, a Rejestr w firmie demo w ogóle nie woła geokodowania), więc oglądający nie kosztują nic, a mapa demo
  pokazuje lokalizatory, których prawdziwe firmy jeszcze nie mają.
- Lokalnie i w teście dymnym `GEOCODER=staly` stawia każdy adres w środku Poznania, a Playwright podmienia skrypt
  Google na atrapę (`e2e/support/google-maps-stub.js`), więc testy nie potrzebują klucza ani nie płacą za zapytania.

## Konsekwencje

- Google jest nowym podprocesorem: geokodowanie dostaje sam adres budowy albo bazy (czasem z nazwiskiem inwestora,
  jeśli ktoś je tam wpisze), a przeglądarka, pobierając mapę, ujawnia Google adres IP i oglądany obszar. Dane mogą
  trafiać do USA. Dopisane w umowie powierzenia (załącznik 3) i polityce prywatności. Przed pierwszym płacącym
  klientem sprawdzić, z którym podmiotem Google jest umowa Google Maps Platform (dla EOG zwykle Google Ireland
  Limited) i czy według warunków ochrony danych Maps Platform Google jest podprocesorem, czy osobnym administratorem;
  od tego zależy brzmienie dokumentów.
- Koszt: Google liczy wczytania mapy i zapytania geokodowania (z miesięcznym limitem darmowym). Tablica wczytuje mapę
  przy każdym wejściu prawdziwej firmy. W Google Cloud ustawić budżet i alert, a klucze ograniczyć do jednego API.
- Zmiana dostawcy dotyczy adaptera geokodowania i komponentu `SiteMap`; dane (`latitude`, `longitude`) są neutralne.
- Kolejność wdrożenia: najpierw migracja (`npm run db:push`), potem kod. Baza jest jedna dla testów i produkcji
  (ADR 0002), a nowy kod czyta `latitude` i `longitude`; migracja jest zgodna wstecz z obecnym kodem.
- Błąd dostawcy przy zapisie adresu wygląda dla właściciela tak samo jak nieznaleziony adres („Nie znaleziono
  adresu”) i nie jest ponawiany sam; ponowić można `npm run sites:geocode` albo postawić pinezkę.
- Budowy założone przed tą zmianą nie mają położenia. Po wdrożeniu (migracja i klucze) trzeba raz uruchomić
  `npm run sites:geocode`, które geokoduje bazy z adresem i aktywne budowy bez położenia we wszystkich firmach poza
  demo; ręcznie postawionych pinezek nie rusza.
