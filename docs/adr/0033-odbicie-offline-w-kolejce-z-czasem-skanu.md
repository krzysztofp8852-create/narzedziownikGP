# 0033. Odbicie bez zasięgu w kolejce offline z czasem skanu, konflikty jako osobna lista do wyjaśnienia

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Na budowie często nie ma zasięgu (piwnica, plac za miastem), a brak sieci nie może odbierać ludziom godzin (#78,
#88). Ruchy mają już kolejkę offline w IndexedDB (ADR 0008), a odbicie to pobyt z wejściem i wyjściem sprawdzanym
na serwerze (ADR 0032). Skan z kolejki dociera po czasie, więc w międzyczasie mogło się zapisać inne odbicie tej
osoby (np. z drugiego telefonu), a telefon bez sieci nie zna stanu serwera.

## Decyzja

- Skan w skanerze programu („Odbij się”) bez zasięgu (`navigator.onLine`) trafia do magazynu `odbicia` tej samej
  kolejki w IndexedDB, z identyfikatorem operacji, chwilą skanu, kodem plakatu i położeniem. Współrzędne czekają tylko
  tam; serwer liczy z nich odległość i ich nie zapisuje. Strona odbicia z kodu QR wkłada odbicie do kolejki pod tym
  samym identyfikatorem operacji, gdy połączenie zerwie się w trakcie wysyłki.
- Telefon zna tylko własny stan (localStorage, osobno dla każdej osoby): gdzie osoba jest odbita według ostatnich
  odbić z sieci i z kolejki, a strona odbicia poprawia go według serwera przy każdym otwarciu. Skan plakatu, na którym
  według telefonu osoba jest odbita tego samego dnia, pyta „Kończysz na tej budowie?”, a odbicie w kolejce niesie to
  potwierdzenie. Stan z poprzedniego dnia telefon pomija (wyjście mogło się zapisać gdzie indziej, np. z drugiego
  telefonu albo zamknięciem o północy), więc pierwszy skan rano to wejście.
  Telefon pamięta też nazwy miejsc z kodów zeskanowanych z siecią, do podpisu na liście oczekujących.
- Nagłówek wysyła odbicia tak jak ruchy (ADR 0008), osobną kolejką: odbicie nie czeka na ruch, który utknął.
- Serwer przyjmuje odbicie z kolejki poleceniem `registerQueuedPunch`: to samo co `punch`, ale w chwili skanu (z
  przyszłości przycięta do chwili dotarcia) i z oznaczeniem `entry_offline` / `exit_offline`. Ponowne wysłanie tej samej
  operacji zwraca pierwotny wynik, także odbicia wysłanego online, którego odpowiedź nie doszła.
- Skan, który nie pasuje do odbić na serwerze, nigdy nie zapisuje się „na siłę” i nie przepada: trafia do
  `app.punch_conflicts` z powodem (`pozniejsze_odbicie`, `nie_odbity_tu`, `juz_odbity_tu`, `kod_niewazny`,
  `budowa_zakonczona`), chwilą skanu i wynikiem sprawdzenia położenia. Późniejsze odbicie tej osoby to konflikt, bo
  wpisanie skanu sprzed niego popsułoby kolejność pobytów. Wejście bez pytania tam, gdzie osoba jest już odbita, to
  konflikt, bo zapisanie go jako wyjścia skończyłoby dzień bez potwierdzenia.
- Konflikty widzi i wyjaśnia (notatka opcjonalna) właściciel i kierownik budowy, na tej samej stronie co odbicia do
  wyjaśnienia; własne konflikty kierownika i skany z kodem, którego już nie ma, tylko właściciel. Godzinę poprawi
  potem poprawka odbicia (#90).
- Błędy, po których warto ponowić (tryb tylko do odczytu, zmiana hasła, brak dostępu, awaria), zostawiają odbicie
  w kolejce, jak przy ruchach.

## Konsekwencje

- Osoba nie dostaje powiadomienia o konflikcie własnego odbicia; dowiaduje się od kierownika, który go wyjaśnia.
  Powiadomienie w dzwonku (nowy rodzaj wpisu i kopii push) można dodać później.
- Stan w telefonie może się rozjechać z serwerem (np. odbicie z drugiego telefonu); wtedy skan bez sieci zrobi
  konflikt, a nie złe odbicie, a pierwsze otwarcie strony odbicia z siecią stan poprawi.
- Skan offline z błędnie wpisanym kodem trafia do właściciela jako konflikt z nieaktualnym kodem.
- Czasu skanu z telefonu nie ograniczamy od dołu (tak jak czasu ruchu w ADR 0008): odbicie z kolejki ma tylko
  oznaczenie „zapisane offline”, a właściciel widzi je w historii.
- Skaner przechodzi do kolejki tylko przy `navigator.onLine` równym false; przy słabym zasięgu, gdy przeglądarka
  myśli, że jest w sieci, strona odbicia może się nie otworzyć.
