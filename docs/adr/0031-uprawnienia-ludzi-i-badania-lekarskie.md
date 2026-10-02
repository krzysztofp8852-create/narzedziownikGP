# 0031. Uprawnienia ludzi i badania lekarskie tylko z datą

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Moduł Ludzie (#78) ma pilnować badań, szkoleń BHP i uprawnień osób z kartoteki (#86), także tych bez konta. Badania
lekarskie to dane o zdrowiu (art. 9 RODO), a kierownik, który sam wysyła ludzi na szkolenia, musi wiedzieć, kto ma
ważne badania na wysokość, ale nie powinien czytać orzeczeń. Wzorzec terminu z cyklem i wykonaniem już mamy przy
narzędziach (ADR 0019).

## Decyzja

- **Uprawnienie** (`app.qualifications`) wskazuje osobę, a nie konto (ADR 0030). Ma rodzaj ze stałej listy albo
  własny rodzaj firmy (`app.qualification_kinds`, dodaje je właściciel), datę „ważne do” (zawsze jest), opcjonalny
  cykl, notatkę, opis (UDT: urządzenie, prawo jazdy: kategoria, oba wymagane; SEP: grupa) i dokumenty. Jedno
  uprawnienie rodzaju (i opisu) na osobę.
- Odnowienie przesuwa datę o cykl od dnia wykonania, jak wykonanie terminu narzędzia. Bez cyklu nową datę trzeba
  podać, więc uprawnienie nigdy nie zostaje bez daty (inaczej niż przegląd bez cyklu).
- **Badania lekarskie** (okresowe i do pracy na wysokości) mają tylko datę i cykl: bez notatki i opisu (ograniczenia
  w bazie), żeby nikt nie wpisał tam treści orzeczenia. Dokumenty badań dodaje i czyta tylko właściciel (RLS
  i kubełek dokumentów jak faktura terminu). Kierownik i sama osoba widzą stan „ważne do… / po terminie”.
- Wpisują, zmieniają i odnawiają właściciel i kierownik, usuwa tylko właściciel. Widzą: właściciel i kierownik
  wszystkie uprawnienia (polityka `people_select` daje kierownikowi osoby z kartoteki), a pracownik i magazynier
  własne, przez osobę swojego konta.
- Przypomnienia: zadanie dzienne 30 dni przed końcem ważności i raz po (wyprzedzenie przypomnienia), każde raz
  (`app.qualification_alerts`). Właściciel dostaje jedno zbiorcze, osoba z kontem o własnych, kierownik o innych nic.
  Osoby nieaktywne się nie liczą. Raport tygodniowy ma sekcję uprawnień z 30 dni i po terminie.

## Konsekwencje

- Pliki uprawnień leżą w tym samym prywatnym kubełku co dokumenty terminów, pod prefiksem `<firma>/uprawnienia/`,
  i znikają z usunięciem firmy.
- Sekcja raportu wskazuje osobę, a nie narzędzie, więc wiersz raportu ma odnośnik i opcjonalny kod zamiast
  identyfikatora narzędzia.
- Udostępnienie modułu na produkcji czeka na przegląd umowy powierzenia i polityki prywatności przez prawnika (#84).
