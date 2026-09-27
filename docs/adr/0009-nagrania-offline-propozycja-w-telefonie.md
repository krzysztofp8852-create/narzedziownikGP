# 0009. Nagrania bez zasięgu czekają w telefonie, a propozycja z nich zostaje w telefonie do zatwierdzenia

Data: 2026-09-27 · Status: przyjęta

## Kontekst

Kierownik bez zasięgu nagrywa wiadomość głosową (#20). Transkrypcja i interpretacja wymagają serwera (ADR 0006),
więc nagranie musi poczekać, a po powrocie sieci stać się propozycją ruchu do zatwierdzenia z czasem zdarzenia
z chwili nagrania. Firma nie chce przechowywać głosów pracowników dłużej, niż to konieczne.

## Decyzja

- Nagranie bez zasięgu (albo gdy połączenie zerwie się w trakcie wysyłki) trafia do IndexedDB razem z autorem
  i chwilą nagrania. Dźwięk leży tam jako ArrayBuffer, bo starsze Safari nie zapisuje Blobów w IndexedDB.
- Kolejka offline z ADR 0008 wysyła nagrania po ruchach, po kolei, akcją `transcribeQueuedRecording`: tą samą
  ścieżką co nagranie online (kubełek nagrań tylko na czas transkrypcji). Telefon usuwa dźwięk po każdym
  ostatecznym wyniku (rozpoznany tekst, cisza, zły plik), a zostawia go do ponowienia przy braku sieci albo
  awarii dostawcy transkrypcji. Nieudana próba nie blokuje kolejnych nagrań; po pięciu nagranie znika
  z komunikatem „powiedz jeszcze raz”. Nagrania idą dopiero wtedy, gdy kolejka ruchów jest pusta, bo
  propozycja powstaje z bieżącego stanu.
- Wynik (propozycja albo rozpoznany tekst do poprawienia) zostaje w telefonie. W nagłówku pojawia się
  „🎙 Do zatwierdzenia: N”, a odnośnik otwiera go w „Powiedz lub wpisz”, gdzie są też wszystkie czekające
  nagrania. ✓ zapisuje ruch z czasem zdarzenia z chwili nagrania; bez zasięgu idzie do kolejki ruchów.
- Propozycji nie zapisujemy na serwerze ani w dzwonku: powstaje z bieżącego stanu w chwili transkrypcji
  i ma sens tylko na urządzeniu, które nagrało.

## Konsekwencje

- Propozycję z nagrania widać tylko na telefonie, który nagrywał. Po wylogowaniu czeka na tę samą osobę.
- Między nagraniem a zatwierdzeniem ktoś mógł ruszyć sprzęt; ✓ odrzuci wtedy ruch jak każdy konflikt
  (narzędzie ruszone po czasie zdarzenia), a kierownik zobaczy, kto i kiedy go przeniósł.
