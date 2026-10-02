# 0032. Odbicie jako kod QR plakatu ze sprawdzeniem położenia na serwerze

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Moduł odbijania (#78, #87) ma dać właścicielowi wiedzę, kto był na której budowie, bez kartki u kierownika. Zdjęcie
kodu wysłane na WhatsAppie nie może wystarczyć do odbicia z domu, ale słaby GPS w piwnicy nie może odbierać ludziom
godzin. Dokładne położenie pracownika to dane osobowe, których program do niczego nie potrzebuje (art. 5 ust. 1 lit. c
RODO), a śledzenie w tle wykluczyliśmy w specyfikacji. Pracownik nie zawsze ma konto, ale ten etap obejmuje tylko
odbicie własne; odbijanie osób z kartoteki przez kierownika (#89), kolejka offline (#88) i zamykanie odbić bez wyjścia
(#90) przychodzą osobno.

## Decyzja

- **Plakat budowy**: budowa i baza mają losowy kod plakatu (10 znaków alfabetu Crockforda, `app.locations.poster_token`,
  losuje go baza przy założeniu miejsca). Kod QR to adres `/odbicie/<kod>`, a ten sam kod jest wydrukowany do wpisania
  ręcznie w skanerze „Odbij się”. Kod nie zdradza identyfikatora budowy, a szukamy go tylko w firmie zalogowanego (RLS).
  „Nowy kod” (`app.renew_poster_token`, bo kierownik nie zmienia wiersza budowy wprost) unieważnia stary plakat.
  Baza bez adresu nie ma plakatu, a jej kod nie działa (`poster_no_address`).
- **Położenie liczy serwer**: telefon wysyła z odbiciem współrzędne i dokładność (albo brak położenia). Rejestr liczy
  odległość (haversine, pełne metry) od położenia budowy z mapy budów i zapisuje tylko wynik i odległość:
  `na_budowie` (odległość najwyżej promień odbicia, domyślnie 300 m), `poza_budowa`, `brak_polozenia`,
  `bez_sprawdzenia` (budowa bez położenia). Współrzędnych nie ma w żadnej tabeli ani wyniku i nie trafiają do SQL,
  więc nie ma ich też w logach błędów bazy. Dokładności nie zapisujemy i na razie nie używamy.
- **Nie blokujemy, oznaczamy**: odbicie z wynikiem innym niż `na_budowie` się zapisuje i trafia na listę „Odbicia do
  wyjaśnienia” właściciela i kierownika budowy. Kierownik nie wyjaśnia własnych odbić (zostają dla właściciela).
- **Odbicie to pobyt**: jeden wiersz `app.punches` od wejścia do wyjścia, z wynikiem sprawdzenia przy wejściu i przy
  wyjściu. Skan na innej budowie zamyka pobyt jako przejście (bez sprawdzenia, bo telefon stoi już na drugiej budowie)
  i otwiera nowy. Osoba ma najwyżej jedno otwarte odbicie (indeks unikalny); wyścig dwóch skanów i ponowka tej samej
  operacji kończą się drugim podejściem, które widzi wynik pierwszego. Wejścia nie zmienia nikt (wyzwalacz), wyjście
  zapisuje raz sama osoba.
- Wyjście z tej samej budowy wymaga potwierdzenia: bez niego polecenie zwraca `potwierdz_wyjscie` i nic nie zapisuje.
  Osobne zapytanie podaje, co zrobi skan, żeby strona zapytała, zanim pobierze położenie.
- W firmie demo położenia się nie sprawdza (wynik „na budowie” bez odległości), żeby oglądający mógł spróbować
  z dowolnego miejsca.

## Konsekwencje

- Kto bardzo chce, podrobi położenie w telefonie. Plakat, promień i lista do wyjaśnienia wystarczą małej firmie,
  w której kierownik zna ludzi; to zabezpieczenie rozsądne, a nie twarde.
- Bez położenia budowy (adres nieznaleziony, brak pinezki) każde odbicie jest „bez sprawdzenia”, więc lista do
  wyjaśnienia zachęca właściciela do postawienia pinezki.
- Poprawki godzin i „bez wyjścia” (#90) dopiszą zmianę wejścia i wyjścia przez kierownika z powodem; dziś wyzwalacz
  tego zabrania.
- Udostępnienie modułu na produkcji czeka na przegląd umowy powierzenia i polityki prywatności przez prawnika (#84).
