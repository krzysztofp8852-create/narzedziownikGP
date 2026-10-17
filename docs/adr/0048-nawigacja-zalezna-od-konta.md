# 0048. Nawigacja zależna od konta zamiast menu pod trzema kreskami, Moje konto i Pomoc

Data: 2026-10-16 · Status: przyjęta (częściowo zastępuje ADR 0022, zmienia demo z ADR 0017)

## Kontekst

Potencjalni klienci, którzy sami klikają w /demo, mówią, że program jest „za skomplikowany” (#172). Cała reszta
programu siedziała w jednym menu pod trzema kreskami, bez ikon: właściciel miał w nim 18 pozycji w czterech grupach,
a w nagłówku jeszcze pięć ikon. Codzienne rzeczy (tablica, narzędzia, skaner) konkurowały w nim z ustawianymi raz
(dokumenty, język, usunięcie konta). Kierownik i magazynier dostawali po pierwszym logowaniu samouczek ekran po
ekranie, czy chcieli, czy nie. Przebudowa architektury informacji idzie w kilku zgłoszeniach (#173–#178) na gałęzi
`redesign`, scalanej do `main` w całości, żeby publiczne demo nie pokazało półgotowego układu.

## Decyzja

- Nawigację każdego konta liczy jedna czysta funkcja `navigation(session)` (`src/lib/navigation.ts`), następczyni
  `appMenu`. Zwraca pozycje paska w kolejności (z wyróżnionym Skanuj), grupy pod „Więcej”, części strony Moje konto
  i części strony Pomoc. Widoczność opiera się na tych samych funkcjach uprawnień co strony, więc nawigacja dalej nie
  prowadzi na „brak dostępu”. Pozycja paska nie powtarza się pod „Więcej”.

  | Konto | Pasek | Pod „Więcej” |
  |---|---|---|
  | Właściciel | Tablica · Narzędzia · Skanuj · Budowy | Sprzęt (Pojazdy, Terminy, Historia, Koszty sprzętu), Ludzie (Ludzie, Czas na budowie), Firma (Raporty, Naklejki, Ustawienia), Pomoc |
  | Kierownik | Tablica · Moje budowy · Skanuj · Ludzie | Sprzęt (Narzędzia, Pojazdy, Terminy, Historia, Koszty sprzętu za zgodą właściciela), Ludzie (Czas na budowie), Firma (Raporty), Pomoc |
  | Magazynier | Tablica · Narzędzia · Skanuj · Terminy | Sprzęt (Budowy, Pojazdy, Historia), Moje (Moje uprawnienia, Mój czas na budowie), Pomoc |
  | Pracownik | Tablica · Skanuj · Zgłoś | „Moje” zamiast „Więcej”: Moje uprawnienia, Mój czas na budowie |

- Telefon i komputer to dwa widoki tego samego modelu w jednym elemencie `<nav>` (`AppNavigation`): poniżej 768 px
  dolny pasek przyklejony do dołu ekranu, z „Więcej” jako arkuszem nad paskiem, a od 768 px stały panel boczny,
  w którym „Więcej” rozwija się na miejscu i zostaje rozwinięte między stronami. Elementy przyklejone do dołu strony
  (podsumowanie checklisty, dymek przewodnika demo) stoją nad paskiem dzięki `--app-nav-height`.
- Aplikacja na Androida nie dostaje `viewport-fit=cover`: Capacitor 8 (SystemBars) odsuwa wtedy całą stronę od pasków
  systemowych, więc dolny pasek na nie nie zachodzi, a przycisk wstecz dalej cofa historię WebView. Arkusz „Więcej”
  zamyka się przy każdej zmianie strony, także po cofnięciu.
- Nagłówek to nazwa firmy, wskaźnik synchronizacji offline, szukaj, dzwonek (skrzynka „Wymaga uwagi” z licznikiem
  spraw „Do zrobienia”; ikona zgłoszeń zniknęła z nagłówka w #177) i imię osoby. Imię prowadzi do **Mojego konta** (`/konto`): język, zmiana hasła (link w e-mailu, ten sam co
  z „Nie pamiętasz hasła?”; pracownik loguje się nazwą, więc dostaje informację, że hasło nadaje właściciel; w demo
  bez hasła, bo konta są wspólne), informacja o usunięciu konta i wylogowanie. Stara strona `/jezyk` przekierowuje do
  Mojego konta. Karta języka zniknęła z ustawień właściciela przy ich podziale (#178).
- Nowa strona **Pomoc** (`/pomoc`, pod „Więcej”) ma czat z obsługą (bez pracownika) i samouczek (bez pracownika
  i demo). Ikona czatu znika z nagłówka; nowe odpowiedzi widać kropką na „Więcej” i licznikiem przy Pomocy. Odnośnik
  do Pomocy niesie bieżący ekran (`?ekran=`), który czat dostaje jako kontekst wiadomości, jak dawniej z nagłówka.
- Samouczek ekran po ekranie przestaje startować sam u kierownika i magazyniera: na tablicy sam startuje już tylko
  pierwszy krok właściciela (lista pierwszych kroków). Stan samouczka zostaje w `app.users.tutorial`.
- Skanuj otwiera na tablicy (`/?skanuj=1`) jeden skaner, który sam rozpoznaje kod (#175): plakat budowy prowadzi do
  odbicia, a naklejka narzędzia do ruchu u tego, kto zapisuje ruchy, i do karty narzędzia u pracownika. Przycisk
  „Odbij się” znika z tablicy; zamiast niego jest pasek stanu odbicia („Jesteś na budowie X od 7:12” albo „Nie jesteś
  odbity”) z otwartego odbicia osoby.
- Budowy prowadzą na stronę Budowy (`/budowy`, #176): aktywne budowy z dodawaniem, zmianą kierownika i adresu
  oraz zamykaniem, pod nimi zakończone (dawne `/budowy/zakonczone`), a jako drugi widok mapa budów
  (`?widok=mapa`). Kierownik ma pod „Moje budowy” tę samą stronę, zawężoną do budów, którymi kieruje. Dawna kotwica
  tablicy `/#budowy` przekierowuje na stronę Budowy. Do nowej tablicy (#180) tablica pokazuje jeszcze stare sekcje.
- Ustawienia (pod „Więcej”, tylko właściciel) to lista czterech podstron (#178): Firma i abonament
  (`/ustawienia/firma`), Sprzęt (`/ustawienia/sprzet`: stawki dzienne, alarm na budowie, naklejki QR, serwisy, baza
  na mapie), Ludzie i dostęp (`/ustawienia/dostep`: kto widzi koszty i zgłoszenia, wylogowanie po bezczynności)
  oraz Dokumenty i dziennik zmian (`/ustawienia/dokumenty`, a sam dziennik dalej pod `/ustawienia/dziennik`). Dawne
  kotwice kart jednej strony (np. `/ustawienia#legal`, `#stawki`) przekierowują do karty na jej podstronie, a
  `#language` do Mojego konta.
- W trybie tylko do odczytu nawigacja nie proponuje operacji: znikają Skanuj i Zgłoś, moduły zostają.
- Odbicia do wyjaśnienia nie mają pozycji w nawigacji; ich lista zostaje jako widok szczegółowy otwierany ze
  skrzynki „Wymaga uwagi” (#177).

## Konsekwencje

- Do czasu skrzynki (#177) do listy odbić do wyjaśnienia prowadzi tylko jej adres. Gałąź `redesign` trafia do `main`
  dopiero razem ze skrzynką.
- Przewodnik po demo wskazuje „Więcej” w pasku zamiast przycisku menu, a na telefonie stawia dymek u góry ekranu, gdy
  element jest na dole. Krótszy przewodnik wokół jednego zadania to osobne zgłoszenie.
- Nowa pozycja nawigacji wymaga decyzji, w którym miejscu tabeli stoi, i etykiety we wszystkich sześciu językach.
- Szeroki ekran rozpoznaje przeglądarka (`matchMedia`); serwer renderuje nawigację jak na telefonie, a układ na
  komputerze daje sam CSS, więc przed załadowaniem skryptów panel boczny już stoi na miejscu.
