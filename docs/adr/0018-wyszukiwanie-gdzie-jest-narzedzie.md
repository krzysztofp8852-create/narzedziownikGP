# 0018. Wyszukiwanie „gdzie jest narzędzie”: lupa dla każdej roli, pytanie głosem przez Interpretację

Data: 2026-09-28 · Status: przyjęta (uzupełnia ADR 0005 i 0006)

## Kontekst

Najczęstsze pytanie na budowie to „gdzie jest niwelator?”. Tablica odpowiada na nie, ale trzeba przewinąć wszystkie
lokalizacje, a pracownik, który nie rusza sprzętu, nie ma nic poza tablicą. Chcemy przycisku wyszukiwania dostępnego
wszędzie i tego samego pytania głosem: w wyszukiwarce i w „Powiedz lub wpisz”, gdzie kierownik i tak mówi do telefonu.

## Decyzja

- Lupa w nagłówku otwiera `/szukaj` dla każdej roli. Lista to tablica (baza, budowy, pojazdy, serwisy i zaginione)
  z kategorią, marką i modelem z zapytania `toolCatalog`, bez wartości w zł. Pole zawęża ją od razu w przeglądarce:
  każde słowo musi być w nazwie, kategorii, marce albo modelu, albo zapytanie to kod bez kresek. Wynik mówi, gdzie
  jest narzędzie, od ilu dni i kto za nie odpowiada (kierownik budowy albo pojazdu), i otwiera kartę narzędzia.
- Pytanie głosem idzie tą samą drogą co nagranie ruchu (ADR 0006): kubełek nagrań na czas transkrypcji, port
  transkrypcji, port interpretacji. Z interpretacji bierzemy tylko wspomniane narzędzia (kody wszystkich pasujących),
  więc slang („flex”, „niwela”) działa jak przy ruchach. Wyszukiwarka nie ma osobnego portu ani promptu.
- Port interpretacji dostał pole `question` (u nas `whereIs`): zdanie pyta, gdzie jest sprzęt, a nie opisuje ruchu.
  W „Powiedz lub wpisz” takie zdanie daje odpowiedź z listą narzędzi zamiast propozycji ruchu; nic się nie zapisuje.
  Interpretacja słowami kluczowymi rozpoznaje „gdzie”, „szukam” i „kto ma”.
- Pytanie zadaje każda rola, także pracownik (`find` w module Interpretacja). Do tej pory jego tekst ani nagranie
  nie trafiały do dostawców AI, bo propozycja ruchu była mu na nic; wyszukiwanie jest mu potrzebne.

## Konsekwencje

- Nagrania i teksty pracowników trafiają do OpenAI (i ElevenLabs przy tym dostawcy transkrypcji) na tych samych
  zasadach co kierowników: bez trenowania, `store: false`, nagranie usuwane zaraz po transkrypcji (ADR 0005, 0006).
- Pytanie głosem znajduje tylko narzędzia w obiegu, bo tylko je zna katalog interpretacji. Zaginione są na liście
  i w wyszukiwaniu tekstem, ale nie w odpowiedzi na pytanie.
- Pytanie nagrane bez zasięgu (kolejka offline, ADR 0009) po transkrypcji nie dostaje odpowiedzi sprzed godzin:
  telefon pokazuje rozpoznany tekst do ponownego wysłania.
- Każde pytanie głosem to jedna transkrypcja i jedno wywołanie modelu interpretacji. Wyszukiwanie tekstem nie
  kosztuje nic i działa bez dostawcy AI.
- Zmiana promptu (pole `question`) wymaga przejścia zestawu ewaluacyjnego, zanim zmienimy model.
