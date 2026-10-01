# 0030. Sprzęt wynajęty jako narzędzie z wypożyczalnią, terminem zwrotu i stanem „zwrócone”

Data: 2026-10-01 · Status: przyjęta · Rozszerza: ADR 0019 (rodzaj terminu), ADR 0028 (pierwszeństwo stawek)

## Kontekst

Kierownik wynajmuje sprzęt z wypożyczalni na kilka dni i zapomina go oddać, a firma płaci za kolejne doby (#78,
#83). Taki sprzęt nie trafiał do ewidencji, więc nie było go na tablicy, w kosztach budowy ani w przypomnieniach.
Wynajęty sprzęt jeździ jednak tak jak własny: z bazy na budowę, między budowami, na busie.

## Decyzja

- Sprzęt wynajęty to zwykłe narzędzie z nazwą wypożyczalni (`app.tools.rented_from`, ustawianą tylko przy
  przyjęciu), a nie osobna encja. Dostaje kod jak każde narzędzie, rusza się zwykłymi ruchami i ma kartę z historią.
- Przyjęcie zapisuje się od razu tam, gdzie sprzęt stoi, bez statusu „zgłoszone”. Właściciel i magazynier
  przyjmują go wszędzie (baza, budowa, pojazd), kierownik na swojej aktywnej budowie albo pojeździe. Właściciele
  (poza aktorem) dostają wpis `sprzet_wynajety` w dzwonku z transakcji przyjęcia.
- Stawka dobowa z umowy leży w osobnej tabeli `app.rental_rates`, bo widzi ją ten, kto widzi koszty narzędzia
  (RLS jak przy historii wartości, ADR 0029), a nazwę wypożyczalni widzi każdy. Stawka wypożyczalni ma
  pierwszeństwo przed kwotą narzędzia, kategorią i firmą i obowiązuje przez cały wynajem, także po terminie zwrotu.
  Liczy się, jak każdy koszt, od dnia startu kosztów firmy.
- Termin zwrotu to rodzaj terminu `zwrot` w `app.tool_deadlines`. Powstaje z przyjęciem, nie ma cyklu ani
  wykonania i nie da się go usunąć. Przypomina dzień przed i raz po. Zmieniają go (przedłużenie) ci sami, którzy
  mogą zapisać zwrot do wypożyczalni.
- Zwrot do wypożyczalni to ruch `zwrot_do_wypozyczalni` bez lokalizacji docelowej, który zmienia stan narzędzia na
  nowy stan `zwrocone`. Narzędzie zostaje w ostatniej lokalizacji, ale poza obiegiem, więc znika z tablicy,
  wyszukiwania, list wyboru, terminów i kosztów. Cofnięcie w 15 minut to ruch w tej samej lokalizacji, który
  przywraca stan „w obiegu”.
- Sprzęt wynajęty nie liczy się do limitu narzędzi progu, a druk „wszystkich nieoklejonych” go pomija. Wybrany
  ręcznie dostaje naklejkę jak każde narzędzie.

## Konsekwencje

- Wartość wynajętego sprzętu podaje tylko właściciel, bo wartości w zł widzi tylko on. Kierownik i magazynier
  przyjmują sprzęt bez wartości.
- Zwrócony sprzęt zostaje w bazie danych jako narzędzie z kodem. Kolejny wynajem tej samej maszyny to nowe
  narzędzie z nowym kodem.
- Przed dniem startu kosztów sprzęt wynajęty nie ma kosztu, jak każdy inny.
