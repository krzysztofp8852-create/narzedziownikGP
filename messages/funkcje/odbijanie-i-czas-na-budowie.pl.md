---
title: Odbijanie i czas na budowie z kodem QR
description: Ludzie odbijają się skanem plakatu budowy z kodem QR, a program liczy, kto był na której budowie i ile godzin. Bez śledzenia GPS, z eksportem do Excela.
heading: Odbijanie na budowie: kto był na której budowie i ile godzin
lead: Przy wejściu na budowę wisi plakat z kodem QR. Ludzie skanują go telefonem na początek i koniec dnia, kierownik odbija brygadę bez telefonów, a program co miesiąc składa zestawienie godzin na budowach. Bez kartki u kierownika i bez śledzenia w tle.
---

## Plakat budowy z kodem QR

Każda budowa, a także baza z adresem, ma swój plakat: kartkę A4 z nazwą budowy, kodem QR i krótką instrukcją. Drukuje go właściciel albo kierownik budowy i wiesza przy wejściu albo na kontenerze. Pod kodem QR jest ten sam kod do wpisania ręcznie, gdyby aparat go nie złapał.

Kod plakatu jest losowy i nie zdradza budowy. Gdy zdjęcie plakatu zacznie krążyć po telefonach, „Nowy kod” unieważnia stary plakat, a Ty drukujesz nowy.

## Wejście, wyjście i przejście

- **Wejście**: pierwszy skan plakatu zapisuje wejście na budowę.
- **Wyjście**: skan na tej samej budowie pyta „Kończysz na tej budowie?” i po potwierdzeniu zapisuje wyjście.
- **Przejście**: skan na innej budowie jednym ruchem zamyka pobyt na poprzedniej i otwiera nowy.

Kierownik widzi w zakładce „Ludzie na budowie”, kto jest teraz odbity na jego budowie.

## Położenie sprawdzane tylko w chwili skanu

Przy każdym skanie program sprawdza, czy telefon jest w promieniu budowy, domyślnie 300 m; dla dużego placu właściciel może promień zwiększyć. Zapisuje tylko wynik: na budowie albo w jakiej odległości od niej. Współrzędnych telefonu nie zapisujemy nigdzie, a między skanami program nie sprawdza położenia, więc nikt nie jest śledzony w tle.

Odbicie spoza promienia albo bez położenia, np. przy słabym GPS w piwnicy, i tak się zapisuje, żeby nikt nie stracił godzin. Trafia jednak na listę „Odbicia do wyjaśnienia” właściciela i kierownika budowy. Zdjęcie plakatu wysłane komuś do domu nie wystarczy więc do odbicia, a słabszy sygnał nie odbiera nikomu dnia.

## Brygada bez telefonów: „Odbij też…”

Nie każdy na budowie ma telefon albo konto w programie. Po własnym skanie właściciel i kierownik dostają listę „Odbij też…” z osobami z kartoteki Ludzie i zaznaczają, kogo odbijają. Przy każdej osobie widać, co zrobi skan: wejście, wyjście albo przejście z innego miejsca.

Przy takim odbiciu widać, kto je zapisał, np. „odbił: Jan Kowalski”, a położenie sprawdza się z telefonu odbijającego. Osoba bez konta nie zajmuje miejsca w pakiecie, więc odbijanie całej brygady nic nie kosztuje.

## Bez zasięgu

Skan bez sieci czeka w telefonie z prawdziwą godziną skanu i wysyła się sam, gdy wróci zasięg. Takie odbicie ma oznaczenie „zapisane offline”. Jeśli w międzyczasie zapisało się inne odbicie tej osoby, np. z drugiego telefonu, skan nie wpisuje się na siłę, tylko trafia do wyjaśnienia u właściciela albo kierownika budowy. Nie przepada i nie psuje godzin.

## Zapomniane wyjście

Od 18:00 ten, kto odbił wejście, dostaje przypomnienie, że osoba wciąż jest odbita na budowie: pracownik o sobie, a kierownik o brygadzie, którą odbijał. Jeśli nikt nie odbije wyjścia, o północy odbicie zamyka się samo jako „bez wyjścia” i trafia do wyjaśnienia. Takie odbicie nie liczy się do godzin, dopóki właściciel albo kierownik nie uzupełni godziny wyjścia, więc zapomniany skan nie daje szesnastu godzin na budowie.

## Poprawka odbicia z historią

Właściciel i kierownik budowy mogą uzupełnić albo zmienić godzinę wejścia i wyjścia, zawsze z powodem. Poprzednia godzina, powód i autor poprawki zostają w historii odbicia. Własne odbicia kierownika poprawia właściciel, a pracownik i magazynier nie poprawiają żadnych odbić, także swoich, żeby godziny były wiarygodne dla wszystkich.

## Czas na budowie z eksportem do Excela

Strona „Czas na budowie” pokazuje dla każdego miesiąca, kto, na której budowie i ile godzin był, z sumami na osobę i budowę. Eksport do Excela podaje godziny dziesiętnie, gotowe dla księgowej albo do rozliczenia z inwestorem.

Liczą się pobyty od wejścia do wyjścia. Dojazd między wyjściem z jednej budowy a wejściem na drugą nie liczy się nigdzie, a przejście jednym skanem kończy pobyt na poprzedniej budowie w chwili skanu na nowej.

- **Właściciel** widzi całą firmę.
- **Kierownik** widzi budowy, które prowadzi.
- **Pracownik i magazynier** widzą własne odbicia i sumy z bieżącego i poprzedniego miesiąca.

To zestawienie pobytu na budowach, a nie ewidencja czasu pracy z Kodeksu pracy. Odbijanie jest w każdym pakiecie ([cennik](/#cennik)), a odbicia i zestawienie godzin przykładowej firmy zobaczysz w [demo](/demo).
