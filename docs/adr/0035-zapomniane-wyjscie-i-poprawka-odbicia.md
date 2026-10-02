# 0035. Zapomniane wyjście: przypomnienie o 18:00, zamknięcie o północy i poprawka odbicia z historią

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Odbicie to pobyt od wejścia do wyjścia (ADR 0032), także odbity przez kierownika za osobę z kartoteki (ADR 0034).
Ludzie zapominają odbić wyjście, a otwarte odbicie liczone do rana dałoby 16 godzin na budowie (#78, #90). Kierownik
i właściciel muszą móc uzupełnić albo poprawić godziny, tak jak korektą poprawia się ewidencję narzędzi, ale czas na
budowie ma być wiarygodny dla wszystkich, więc pracownik własnych odbić nie poprawia. Vercel Hobby uruchamia
zadanie harmonogramu raz dziennie i w dowolnej chwili wskazanej godziny UTC.

## Decyzja

- Zadanie `/zadania/odbicia` (`vercel.json`: 16, 17, 22 i 23 UTC) robi dwie rzeczy, a Rejestr sam pilnuje pory:
  - `notifyForgottenExits`: od 18:00 w Polsce każde odbicie otwarte teraz dostaje przypomnienie raz
    (`exit_reminded_at`). Dostaje je ten, kto odbił wejście (`punched_by`): osoba sama albo kierownik za osobę
    z kartoteki, jedno zbiorcze o wszystkich swoich (dzwonek i push, bez e-maila). Gdy jego konto nie jest już
    aktywne, przypomnienie dostaje osoba ze swoim aktywnym kontem.
    Kto odbije się po pierwszym uruchomieniu, dostaje przypomnienie przy następnym.
  - `closeForgottenExits` (najpierw, żeby nie przypominać o odbiciach, które właśnie się zamykają): odbicia otwarte z wejściem przed dzisiejszą północą w Polsce zamykają się z
    `exit_via = 'bez_wyjscia'` i `left_at` równym północy po dniu wejścia. Uruchomienie przed północą nic nie
    zamyka, więc dwie godziny UTC wystarczają na czas zimowy i letni.
- Odbicie „bez wyjścia” trafia do wyjaśnienia jak odbicie z oznaczeniem położenia i nie liczy się do czasu na
  budowie (`timeOnSiteMs` null). `left_at` zostaje wypełnione, żeby „otwarte” wciąż znaczyło `left_at is null`
  (jedno otwarte odbicie na osobę, obecni na budowie, stan telefonu).
- Poprawka odbicia to wiersz `app.punch_corrections` (pole, godzina sprzed poprawki, nowa godzina, powód, kto, kiedy).
  Polityka RLS wpuszcza tylko właściciela i kierownika budowy, jeśli odbicie nie jest jego własne. Inaczej niż przy
  wyjaśnianiu (ADR 0034) kierownik poprawia też odbicia brygady, które sam odbił: i tak decyduje, kiedy je odbija,
  a to o nich dostaje przypomnienie. Godzinę sprzed poprawki wpisuje wyzwalacz z odbicia, a godziny odbicia zmienia
  tylko wyzwalacz tej tabeli (SECURITY DEFINER); wyzwalacz odbić przepuszcza z zagnieżdżonego wyzwalacza wyłącznie
  zmianę wejścia, wyjścia i sposobu wyjścia. Wejście i wyjście poprawione naraz zapisują się w jednej transakcji. Uzupełnione wyjście odbicia „bez wyjścia” albo otwartego dostaje
  `exit_via = 'uzupelnione'` i zaczyna się liczyć do czasu.
- Rejestr sprawdza, że godzina nie sięga w przyszłość, wejście zostaje przed wyjściem, a pobyt nie nachodzi na
  sąsiednie odbicia tej osoby (`punch_overlap`); północ odbicia „bez wyjścia” nie jest granicą. Kierownik nie widzi
  odbić osoby spoza swoich budów, więc granice podaje funkcja `app.punch_neighbours` (bez historii, jak
  `app.punch_state`).

## Konsekwencje

- Wyjście ze skanu offline sprzed północy, które dotrze po zamknięciu, jest konfliktem odbicia
  (`pozniejsze_odbicie`); kierownik uzupełnia wtedy wyjście poprawką.
- Czas na budowie (#91) liczy tylko odbicia z `exit_via` innym niż `bez_wyjscia`.
- Odbicie „bez wyjścia” brygady odbitej przez kierownika jest na liście do wyjaśnienia właściciela, a kierownik
  uzupełnia jego wyjście w zakładce „Ludzie na budowie”.
- Kto odbije się latem po około 20:00, nie dostaje przypomnienia (ostatnie uruchomienie wieczorem to 19:xx); o północy
  jego odbicie i tak zamknie się „bez wyjścia”.
