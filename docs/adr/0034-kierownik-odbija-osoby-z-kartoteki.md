# 0034. Kierownik odbija osoby z kartoteki („Odbij też…”)

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Połowa brygady nie ma telefonu albo konta w programie (ADR 0030), a czas na budowie ma objąć całą brygadę (#78,
#89). Odbicie to pobyt sprawdzany położeniem telefonu na serwerze (ADR 0032), z kolejką offline (ADR 0033). Kierownik
widzi odbicia tylko na budowach, których jest kierownikiem, a jego brygada przechodzi też przez budowy innych
kierowników i bazę.

## Decyzja

- Po skanie plakatu właściciel i kierownik dostają pod własnym odbiciem (także przy pytaniu „Kończysz?”) listę
  „Odbij też…”: aktywne osoby z kartoteki oprócz siebie, z kontem i bez, a przy każdej, co zrobi skan (wejście,
  wyjście, przejście z innego miejsca), najpierw odbite tutaj. Zaznaczenie osoby z wyjściem to potwierdzenie jej
  wyjścia. Lista mogła się zestarzeć: osoba odbita w międzyczasie tutaj daje `potwierdz_wyjscie`, a wyjście osoby
  odbitej w międzyczasie gdzie indziej `nie_odbity_tu`; w obu przypadkach nic się dla niej nie zapisuje.
- Polecenie `punchPeople` odbija zaznaczonych w jednej transakcji tą samą logiką co własny skan, z wynikiem
  sprawdzenia położenia odbijającego. Każda osoba ma własny identyfikator operacji, więc ponowka (i kolejka offline)
  nie dubluje odbić. Kto odbił wejście, mówi `punched_by`, a wyjście `exit_punched_by`; przy osobie widać „odbił: X”.
  Pracownik i magazynier odbijają tylko siebie (polityki RLS i Rejestr).
- Kierownik widzi odbicia na swoich budowach, własne i te, które sam odbił. Żeby przenieść osobę z budowy, której
  nie prowadzi, dostaje stan jej odbić z funkcji `app.punch_state` (otwarte odbicie i chwila ostatniego, bez
  historii), a zamyka tamto odbicie funkcją `app.close_punch_of`. Stan dostaje właściciel, kierownik i sama osoba,
  a zamknąć cudze odbicie mogą tylko właściciel i kierownik. Kierownik dowiaduje się więc, gdzie osoba z kartoteki jest odbita teraz, ale nie widzi jej historii.
- Odbicia i konflikty, które kierownik sam odbił, wyjaśnia właściciel, tak jak własne odbicia kierownika: inaczej
  kierownik oznaczałby jako wyjaśnione odbicia brygady sprzed budowy.
- Bez sieci telefon właściciela i kierownika pamięta listę z ostatniego skanu z siecią i stan osób, które odbija, a
  każda zaznaczona osoba trafia do kolejki offline jako osobne odbicie z chwilą skanu (`personId` w
  `registerQueuedPunch`). Skan osoby, która przed wysłaniem przestała być aktywna, jest konfliktem
  `osoba_nieaktywna`, żeby nie blokował kolejki odbijającego.

## Konsekwencje

- Lista „Odbij też…” bez sieci jest tak aktualna jak ostatni skan z siecią; skan, który nie pasuje do serwera, robi
  konflikt do wyjaśnienia, a nie złe odbicie.
- Przypomnienie o 18:00 za osobę odbitą przez kierownika (#90) może trafić do tego, kto odbił wejście otwartego
  odbicia (`punched_by`).
- Kierownik może odbić także osobę z kontem (np. bez telefonu tego dnia); ona sama może potem odbić wyjście.
