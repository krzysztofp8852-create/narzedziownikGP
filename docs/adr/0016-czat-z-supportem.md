# 0016. Czat z supportem: wątek na użytkownika, automatyczna odpowiedź w bazie, znaczniki przeczytania w wątku

Data: 2026-09-28 · Status: przyjęta (uzupełnia ADR 0011 i 0013)

## Kontekst

Właściciel, kierownik i magazynier piszą do GP Engineering na czacie jak w komunikatorze (#39), także ze zdjęciem
lub zrzutem ekranu. Odpowiadamy z panelu super-admina, o nowej wiadomości dowiadujemy się e-mailem, a użytkownik
o odpowiedzi z okna 💬 z licznikiem i z pusha. Po pierwszej wiadomości (i po każdej, jeśli od naszej ostatniej
odpowiedzi minęła doba) przychodzi automatyczna odpowiedź. Czat działa w trybie tylko do odczytu, a pracownik go
nie ma.

## Decyzja

- Wątek to wiersz `app.support_threads` z identyfikatorem użytkownika (jeden na osobę), a wiadomości
  `app.support_messages` tylko się dopisują (wyzwalacz). Wątek widzi tylko jego użytkownik i super-admin, także
  właściciel firmy nie czyta wątków swoich ludzi. Pisze użytkownik z rolą, którą ma (poza pracownikiem), i super-admin;
  pilnuje tego RLS.
- Automatyczną odpowiedź dopisuje wyzwalacz po wiadomości użytkownika, gdy w ostatniej dobie nie było od nas żadnej
  wiadomości: ani supportu, ani automatu. Pierwsza wiadomość zawsze ją dostaje, a kilka wiadomości pod rząd tylko
  pierwsza. Nikt nie dopisze jej inną drogą, a jej tekst jest w migracji. Zapis wiadomości blokuje wiersz wątku do
  końca transakcji, więc dwie wiadomości wysłane naraz nie dostaną dwóch automatycznych odpowiedzi.
- Kontekst (rola w chwili pisania, ekran, z którego otwarto czat, wersja aplikacji) zapisuje się przy każdej
  wiadomości użytkownika, bo rola i wersja się zmieniają. Firmę i osobę wskazuje wątek. Ekran przekazuje ikona 💬
  w nagłówku (`?ekran=`), a wersję strona czatu z chwili, w której ją pobrano.
- „Przeczytane” to dwa znaczniki w wątku: numer ostatniej przeczytanej wiadomości po stronie użytkownika i po stronie
  supportu. Każdy zmienia tylko jego strona (wyzwalacz), a wiadomości zostają nietknięte. Licznik 💬 liczy tylko
  odpowiedzi supportu; automatyczna odpowiedź przychodzi, gdy użytkownik i tak patrzy na czat. Wysłanie wiadomości
  czyta wątek za tego, kto ją wysłał. Otwarcie okna (z nagłówka, z pusha, z e-maila do supportu) idzie przez trasę
  `…/otworz`, która czyta wątek i przekierowuje, jak przy zgłoszeniach.
- Wiadomość użytkownika i jej odczyt to sprawy samego aktora (`personal`, ADR 0013): działają w trybie tylko do
  odczytu. Super-admin nie jest blokowany.
- E-mail do supportu to osobna metoda portu powiadomień (`Notifier.sendToSupport`), bo adresat nie jest
  użytkownikiem firmy: adres (`SUPPORT_EMAIL`) zna adapter. Idzie po zatwierdzeniu, najwyżej raz (ADR 0004).
- Odpowiedź supportu ma kopię push (`PushMessage` z oknem `czat`, ADR 0011); wiadomość użytkownika i automatyczna
  odpowiedź nie. Ponowienie operacji nie daje drugiej kopii.
- Zdjęcia leżą w osobnym prywatnym kubełku `zdjecia-czatu` (drugi port zdjęć Rejestru), sprawdzane i zapisywane
  jak zdjęcia zgłoszeń (ADR 0015). Wiadomość może być samym zdjęciem.

## Konsekwencje

- Użytkownik po zmianie roli na pracownika (dziś niemożliwej) straciłby dostęp do wątku; jego wiadomości zostają.
- Dezaktywowana osoba nie widzi już czatu, ale jej wątek zostaje w panelu z oznaczeniem konta.
- Okno 💬 pokazuje 300 ostatnich wiadomości wątku.
- Wątek ma kolejność wiadomości z numeru w bazie, a automatyczna odpowiedź ten sam czas co wiadomość, po której
  przyszła.
- Nie ma e-maila do użytkownika o odpowiedzi: użytkownik dowiaduje się z licznika 💬 i z pusha.
