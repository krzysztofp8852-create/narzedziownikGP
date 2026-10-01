# 0019. Terminy przeglądów, kalibracji i gwarancji: stałe rodzaje przy narzędziu, przypomnienia z zadania dziennego

Data: 2026-09-29 · Status: przyjęta (uzupełnia ADR 0007, 0012 i 0015)

## Kontekst

Właściciel pilnuje w Excelu kalibracji niwelatorów, przeglądów elektronarzędzi, badań UDT i końca gwarancji (#58).
Chcemy, żeby system przypominał o nich sam, jak o alarmach: w dzwonku, w raporcie tygodniowym, na karcie narzędzia,
w wyszukiwaniu i przy ruchu do serwisu i z serwisu. Specyfikacja zostawiła otwarte pytania: czy termin blokuje
wydanie, stałe czy własne rodzaje, ile dni przed terminem przypominać, kto wpisuje wykonanie, terminy per narzędzie
czy per kategoria i czy dokumenty wliczają się do limitu. Dokumenty (świadectwa, protokoły, karty gwarancyjne,
faktury) to pliki, a na fakturze jest cena, którą widzi tylko właściciel.

## Decyzja

- Termin to wiersz `app.tool_deadlines` przy narzędziu: rodzaj ze stałej listy (przegląd, kalibracja, badanie UDT,
  gwarancja), najwyżej jeden każdego rodzaju na narzędzie, data i opcjonalny cykl w miesiącach (1–120). Nie ma rodzajów
  firmy ani terminów per kategoria: cztery rodzaje pokrywają to, o co pytają klienci, a jeden termin rodzaju na
  narzędzie wystarcza importowi i przypomnieniom.
- Wykonanie (dzień, najpóźniej dziś w Polsce) zapisuje funkcja `app.complete_tool_deadline`: następny termin to data
  podana przy wykonaniu (późniejsza niż wykonanie, np. z protokołu), a bez niej dzień wykonania plus cykl (Postgres:
  31 stycznia i miesiąc to koniec lutego); bez cyklu i bez podanej daty terminu nie ma, dopóki właściciel nie wpisze
  nowego. Gwarancji się nie wykonuje. Ponowne wysłanie tej samej operacji wykonania zwraca bieżący termin i niczego nie
  zmienia, także gdy właściciel poprawił go w międzyczasie. Historii wykonań nie trzymamy: karta pokazuje ostatnie
  wykonanie, a świadectwa i protokoły z kolejnych lat zostają jako dokumenty terminu.
- Terminy dodaje, zmienia i usuwa właściciel. Wykonanie (z następnym terminem) wpisuje też magazynier, bo to on odbiera
  sprzęt z serwisu i ma w ręku protokół, ale zmienić terminu wprost nie może, więc zapis idzie przez funkcję. Po
  przyjęciu z serwisu checklista, skaner i wpis tekstem podpowiadają wpisanie wykonania i prowadzą do karty narzędzia.
  Kierownik i pracownik terminy widzą.
- Termin po terminie tylko ostrzega (tablica, wyszukiwanie, karta, checklista przy wydaniu i przeniesieniu), a ruchów
  nie blokuje, tak jak flaga „uszkodzone”: sprzęt bywa potrzebny na budowie, a decyzja należy do ludzi.
- Przypomnienia wysyła codziennie o 5:00 UTC zadanie `/zadania/terminy`, każda firma w osobnej transakcji, jak progi
  dni (ADR 0007). Dzień liczy się w Polsce. Przypomnienie „przed” należy się od 7 dni przed terminem do dnia terminu,
  a „po” od następnego dnia; koniec gwarancji ma tylko „przed”. Każde zdarzenie (termin z danego dnia i faza) zapisuje
  się raz w `app.deadline_alerts`, więc drugie wywołanie niczego nie powtarza, pominięte nie gubi przypomnień, a nowa
  data (zmiana, wykonanie) daje nowe. Wyprzedzenie jest stałe w programie, a nie ustawieniem firmy czy terminu, i
  przypisane do rodzaju terminu (`reminder-lead.ts`): przy narzędziach tydzień, bo tyle trzeba, żeby ściągnąć sprzęt z
  budowy, a kolejne rodzaje (OC pojazdu, uprawnienia ludzi, zwrot sprzętu wynajętego) dostają 30 albo 1 dzień bez
  zmiany faz „przed” i „po”.
- Przypomnienie to wpis dzwonka `terminy` z listą terminów z danego dnia, bez kopii e-mail (jak progi dni). Każdy
  aktywny właściciel dostaje jeden wpis o wszystkich, a kierownik budowy albo pojazdu jeden o sprzęcie, który jest
  teraz u niego. Właściciel, który sam jest kierownikiem budowy albo pojazdu, ma ten sprzęt w swoim wpisie i drugiego
  nie dostaje. Sprzęt wycofany i zaginiony nie przypomina.
- Raport tygodniowy dostaje sekcję terminów z najbliższych 30 dni i po terminie, bez wygasłych gwarancji. Ta sama lista
  jest pod `/terminy` dla każdej roli; tam prowadzi zbiorcze przypomnienie.
- Dokumenty leżą w prywatnym kubełku `dokumenty-narzedzi` (trzeci port plików Rejestru, jak zdjęcia zgłoszeń, ADR 0015):
  PDF albo JPG, PNG, WEBP do 4 MB rozpoznane po treści pliku, zapisane przed zatwierdzeniem transakcji i usuwane, gdy
  się nie zatwierdzi. Dokument ma rodzaj; fakturę (cena) widzi i dołącza tylko właściciel, co pilnuje RLS, a resztę widzi
  każdy w firmie, bo świadectwo pokazuje się inspektorowi na budowie. Dokumenty nie wliczają się do limitu progu: limit
  dotyczy liczby narzędzi, a pojedynczy plik ma najwyżej 4 MB.
- Import z Excela czyta kolumny „Następny przegląd” i „Gwarancja do” (RRRR-MM-DD, jak zapisuje Excel, albo
  DD.MM.RRRR) i zakłada z nich terminy bez cyklu.

## Konsekwencje

- Firma, która ma dwa różne przeglądy jednego narzędzia (np. elektryczny i mechaniczny), zapisze drugi w opisie albo
  jako badanie UDT; gdyby to było częste, potrzebne będą rodzaje firmy.
- Kierownik, któremu sprzęt przyjechał po przypomnieniu, nie dostaje go drugi raz; termin widzi na karcie i w `/terminy`.
- Nowy właściciel albo kierownik nie dostaje przypomnień wykrytych przed jego kontem.
- Termin z datą z przeszłości (import starego przeglądu) daje przypomnienie „po terminie” przy najbliższym zadaniu.
- Usunięcie terminu kasuje jego dokumenty z kubełka po zatwierdzeniu transakcji; gdy usunięcie pliku zawiedzie, plik
  zostaje w kubełku bez wiersza (błąd w logu serwera).
- Migracja `tool_deadlines` musi trafić do bazy przed wdrożeniem kodu, bo tablica czyta tabelę terminów.
