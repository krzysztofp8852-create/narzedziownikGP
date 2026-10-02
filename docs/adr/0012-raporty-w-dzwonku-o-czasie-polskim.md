# 0012. Raporty jako wpisy dzwonka, wysyłane o czasie polskim przez podwójny harmonogram

Data: 2026-09-27 · Status: przyjęta (uzupełnia ADR 0007 i 0011)

## Kontekst

Właściciel ma dostawać raport tygodniowy w poniedziałek o 7:00, a właściciel i kierownicy raport piątkowy
w piątek o 16:00 czasu polskiego (#23). Vercel Cron liczy w UTC, więc 7:00 w Polsce to zimą 6:00 UTC, a latem
5:00 UTC. Na planie Hobby każde zadanie działa najwyżej raz dziennie i odpala się w dowolnej chwili wskazanej
godziny, a Vercel bywa, że pominie wywołanie albo wywoła je dwa razy. Raport tygodniowy porównuje kwotę
poza bazą z poprzednim tygodniem.

## Decyzja

- Jedno zadanie `/zadania/raporty` ma w `vercel.json` cztery wpisy: poniedziałek 5:00 i 6:00 UTC, piątek
  14:00 i 15:00 UTC. O tym, czy pora, decyduje Rejestr (`dueReports`): raport jest należny od godziny raportu
  do końca tego dnia w Polsce. Wywołanie przed godziną (zimą to o 5:00 UTC) nic nie robi, a to po wysłaniu
  (latem o 6:00 UTC) niczego nie powtarza.
- Każdy raport firmy z danego dnia zapisuje się raz: wiersz w `app.company_reports` (firma, rodzaj, dzień),
  dopisywany w tej samej transakcji co wpisy dzwonka. Ponowne albo równoległe wywołanie nic nie dodaje.
- Raport to wpis dzwonka (`raport_tygodniowy`, `raport_piatkowy`) z pełną treścią z chwili raportu, jak każde
  powiadomienie (ADR 0007). Push i e-mail są jego kopią, wysyłaną tylko dla nowych wpisów (ADR 0011). E-mail
  dostaje właściciel (oba raporty); kierownik ma raport piątkowy tylko w dzwonku i push, zawężony do swoich
  lokalizacji, i nie dostaje nic, gdy nic na nich nie ma. Właściciel, który sam jest kierownikiem lokalizacji, dostaje
  tylko raport całej firmy. Gdy w piątek cały sprzęt jest na bazie albo w serwisie,
  raportu piątkowego nie dostaje nikt, także właściciel: przypomnienie „zwieź przed weekendem” nie ma treści.
- Link z pusha, dzwonka i e-maila prowadzi na `/raporty/<rodzaj>/<dzień>`. Strona pokazuje raport z dzwonka
  aktora (klucz zdarzenia `raport_<rodzaj>:<dzień>`), a nie stan bieżący. Strona `/raporty` (#94, właściciel
  i kierownik) wymienia raporty z dzwonka aktora i prowadzi do raportu na teraz, `/raporty/<rodzaj>`, złożonego
  w chwili otwarcia z tych samych zapytań co raport w dzwonku.
- Treść raportu składa Rejestr z tych samych danych co tablica, w transakcji najdawniej dodanego aktywnego
  właściciela (RLS pilnuje firmy, wartości w zł widzi właściciel). Te same zapytania są dostępne w danej chwili:
  `weeklyReport()` (właściciel) i `fridayReport()` (właściciel całą firmę, kierownik swoje lokalizacje).
- Raport tygodniowy zapamiętuje w `app.company_reports` kwotę poza bazą (piątkowy zapisuje tam tylko dzień).
  Porównanie jest z raportem z poniedziałku poprzedniego tygodnia, także gdy raport czyta się w środku tygodnia;
  gdy go nie ma (pierwszy raport, pominięte zadanie), porównania nie ma.
  Nie odtwarzamy kwoty z historii ruchów, bo wartości narzędzi nie mają historii.
- „Poza bazą” to na razie aktywne budowy, jak na tablicy. Pojazdy (#35) dołączą do raportów razem z tablicą.

## Konsekwencje

- Na Hobby raport przychodzi między 7:00 a 8:00 (piątkowy między 16:00 a 17:00) czasu polskiego.
- Gdy oba wywołania z danego dnia przepadną, raportu z tego dnia nie ma (nie nadrabiamy go następnego dnia),
  a następny raport tygodniowy nie ma z czym porównać kwoty.
- Wpis dzwonka z raportem jest większy niż inne powiadomienia (cała lista narzędzi); push wysyła tylko nagłówek.
- Zmiana kierownika po piątkowym raporcie nie zmienia tego, co już jest w dzwonkach.
