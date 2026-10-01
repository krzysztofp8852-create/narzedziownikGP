# 0029. Kierownik widzi koszty swoich lokalizacji za zgodą właściciela

Data: 2026-10-01 · Status: przyjęta · Zmienia: ADR 0028 (kto widzi stawki i historię wartości)

## Kontekst

Koszt sprzętu (#80) widział tylko właściciel, jak wartości w zł. Część właścicieli chce, żeby kierownik pilnował
kosztów swojej budowy i szybciej oddawał sprzęt (#81), a część nie chce pokazywać cen. Decyzja należy więc do
właściciela, a nie do programu.

Koszt liczy się ze stawek i historii wartości: stawka procentowa to procent wartości narzędzia z danego dnia.
Rejestr liczy koszt w transakcji aktora pod RLS, więc kierownik, który ma widzieć koszt, musi móc te dane czytać.

## Decyzja

- Ustawienie firmy „Kierownik widzi koszty swoich budów i pojazdów” (`site_managers_see_costs`), domyślnie
  wyłączone. Zmienia je tylko właściciel.
- Z ustawieniem kierownik widzi zakładkę „Koszty” i zestawienie kosztów tylko dla lokalizacji, których jest teraz
  kierownikiem. Bez niego nie widzi kwot ani pozycji „Koszty sprzętu” w menu. Magazynier i pracownik nie widzą
  kosztów nigdy.
- RLS daje kierownikowi ze zgodą stawki firmy i kategorii oraz kwoty zł/dzień i historię wartości tylko tych
  narzędzi, które kiedyś trafiły ruchem bez cofnięcia do jego lokalizacji. Zapisywać stawki może dalej tylko
  właściciel.
- Ustawienia stawek i stawka na karcie narzędzia zostają tylko dla właściciela. Kierownik widzi stawki tylko
  w wierszach kosztu swojej lokalizacji (dni × stawka).

## Konsekwencje

- Kierownik ze zgodą może wyliczyć wartość narzędzia ze stawki procentowej, a połączeniem z bazą przeczytać
  historię wartości sprzętu ze swoich lokalizacji. Akceptujemy to, bo zgodę daje właściciel. Wartości pozostałego
  sprzętu kierownik nie zobaczy.
- Po zmianie kierownika budowy koszty i dane sprzętu z całej jej historii widzi nowy kierownik, a poprzedni już nie.
