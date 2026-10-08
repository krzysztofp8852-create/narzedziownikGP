# 0024. Limit osób zapisujących ruchy blokuje dodawanie, a nie tylko ostrzega

Data: 2026-09-30 · Status: przyjęta; pakiety i ich limity zastąpione przez ADR 0040 (jeden pakiet)

## Kontekst

Cena wdrożenia zależy od liczby osób, które zapisują ruchy: właścicieli, kierowników i magazynierów (#66). Mały
pakiet obejmuje do 2 osób (3000 zł), średni 3–6 (4000 zł), a duży 7 i więcej (5000 zł). Bez limitu w programie
firma z małym pakietem założyłaby dziesięć kont z prawem do ruchów bez dopłaty. Limit narzędzi w progu abonamentu
tylko ostrzega (`ToolLimitWarning`): narzędzie się zapisuje, bo dodaje się je w biegu, często z budowy, i blokada
zatrzymałaby pracę.

## Decyzja

- Firma ma pakiet wdrożenia (`app.subscriptions.implementation_tier`). Super-admin wybiera go przy zakładaniu firmy
  i zmienia na karcie firmy. Pakiety i limity zna Rejestr (`IMPLEMENTATION_TIERS`); duży nie ma górnej granicy.
- Dodanie kierownika albo magazyniera bez wolnego miejsca w pakiecie odmawia (`recorder_limit`), zanim powstanie
  konto logowania. Dodanie osoby zapisującej ruchy to świadoma decyzja właściciela w ustawieniach, a nie praca w biegu,
  więc blokada niczego nie zatrzymuje. Pracownik nie zapisuje ruchów, więc miejsca nie zajmuje.
- Liczą się aktywne konta tych trzech ról, także każdy właściciel. Dezaktywacja zwalnia miejsce, a wyższy pakiet
  odblokowuje dodawanie od razu. Po zmianie na niższy pakiet nikt nie traci konta; firma tylko nie doda nowych osób.
- Rejestr sprawdza miejsce drugi raz w transakcji, która zapisuje osobę, pod blokadą wiersza firmy
  (`select … for update` na `app.companies`), żeby dwa równoległe dodania nie zajęły jednego miejsca.
- Formularz w zespole pokazuje wykorzystanie limitu, a bez miejsca potrzebny pakiet, dopłatę (różnica cen pakietów)
  i kontakt do GP Engineering: czat z supportem albo dział handlowy. Dopłatę rozlicza się poza programem.
- Istniejące firmy zapłaciły dotychczasowe wdrożenie 5000 zł, więc migracja daje im duży pakiet. Duży mają też firmy
  zakładane skryptem i firma demo (włączenie demo ustawia go na nowo).

## Konsekwencje

- Właściciela nie dodaje formularz zespołu, tylko super-admin albo skrypt, i ci nie są blokowani. Właściciel ponad
  limitem po prostu zajmuje miejsce, jak każdy inny.
- Gdyby kiedyś dało się zmienić rolę pracownika na kierownika, ta zmiana musi sprawdzić miejsce tak samo jak dodanie.
