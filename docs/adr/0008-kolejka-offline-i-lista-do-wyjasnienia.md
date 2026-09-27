# 0008. Kolejka offline w IndexedDB, odrzucenia na serwerze jako lista „Do wyjaśnienia”

Data: 2026-09-27 · Status: przyjęta

## Kontekst

Kierownik w piwnicy bez zasięgu rejestruje ruch checklistą, skanerem albo zatwierdza propozycję z tekstu (#19).
Ruch ma poczekać w telefonie i wysłać się sam, a jeśli serwer go nie przyjmie (ktoś w międzyczasie przeniósł
narzędzie, budowa ma innego kierownika albo jest zakończona), trafić na listę „Do wyjaśnienia” z powodem i do
dzwonka (ADR 0007). Instalowalnej PWA z pracą bez sieci od startu (#18) jeszcze nie ma.

## Decyzja

- Formularz ruchu bez zasięgu (`navigator.onLine`) albo po zerwanym połączeniu w trakcie wysyłki wkłada ruch do
  IndexedDB (`src/lib/offline/`) z identyfikatorem operacji klienta, czasem zdarzenia z tej chwili, oczekiwaną
  lokalizacją źródłową i autorem. Ten sam identyfikator operacji sprawia, że ruch, który mimo zerwanego
  połączenia dotarł na serwer, po ponownym wysłaniu się nie zdubluje.
- Nagłówek pokazuje „Oczekuje: N” z listą i wysyła kolejkę po kolei, w kolejności zapisu: przy otwarciu
  aplikacji, po zdarzeniu `online`, po powrocie do karty i co 20 s, dopóki coś czeka. Bez sieci albo przy
  błędzie, po którym warto ponowić, zatrzymuje się, żeby późniejszy ruch nie wyprzedził wcześniejszego.
  Wysyła tylko ruchy zalogowanej osoby.
- Serwer przyjmuje ruch z kolejki poleceniem `registerQueuedMovement`: to samo co `registerMovement` z czasem
  zdarzenia z telefonu. Konflikt obejmuje też narzędzie, które ruszyło się po czasie zdarzenia. Błąd Rejestru
  inny niż wymagana zmiana hasła albo brak dostępu jest ostateczny: odrzucenie zapisuje się w
  `app.rejected_movements` (powód, konflikty), autor dostaje powiadomienie w dzwonku z odnośnikiem do
  `/do-wyjasnienia`, a ponowne wysłanie tej samej operacji zwraca to samo odrzucenie. Telefon usuwa ruch z
  kolejki zarówno po zapisie, jak i po odrzuceniu.
- Lista „Do wyjaśnienia” jest na serwerze, więc działa na każdym urządzeniu i z każdego powiadomienia. Widzi
  ją tylko autor; „Wyjaśnione” zamyka odrzucenie, a historia ruchów się nie zmienia.

## Konsekwencje

- Dopóki nie ma #18, kolejka działa w otwartej już aplikacji: strona otwarta bez sieci się nie wczyta, ale to,
  co zapisano bez zasięgu, wyśle się przy następnym otwarciu aplikacji z siecią.
- Tablica w telefonie bez sieci nie wie o ruchach z kolejki: narzędzie wydane offline nadal widać na bazie,
  dopóki kolejka się nie wyśle.
- Ruch z kolejki po zmianie stanu nigdy nie zapisze się „na siłę”; poprawny stan ustawia kierownik nowym ruchem
  albo właściciel korektą.
