# 0005. Interpretacja wpisu tekstem przez OpenAI API, bez trenowania i przechowywania odpowiedzi

Data: 2026-09-26 · Status: przyjęta (retencję i umowę powierzenia sprawdzić przed pierwszym płacącym klientem)

## Kontekst

Wpis tekstem (#15) zamienia zdanie kierownika („biorę dwie szlifierki i młot na Rataje”) w propozycję
ruchu. Specyfikacja (#1) wskazywała Claude Haiku 4.5 ze strukturalnym wyjściem, ale firma ma konto OpenAI API,
więc port interpretacji korzysta z OpenAI. Wymóg ze specyfikacji zostaje: dostawca AI skonfigurowany bez
trenowania na danych klienta. Do dostawcy trafia tekst wpisu i lista narzędzi firmy (kod, nazwa, kategoria,
lokalizacja) z nazwami aktywnych budów. Nazwisk kierowników ani wartości nie wysyłamy.

## Decyzja

- Port interpretacji (`src/interpretation/openai-interpreter.ts`) woła OpenAI Responses API przez oficjalne SDK
  (`openai`) ze strukturalnym wyjściem (`text.format`: schemat JSON, `strict`), więc odpowiedź zawsze ma kształt,
  którego oczekuje moduł. Model domyślnie `gpt-5.4-mini` (szybki i tani), inny w `OPENAI_MODEL`; modele gpt-5
  dostają niski wysiłek rozumowania, bo kierownik czeka na odpowiedź.
- Model tylko dopasowuje frazy do narzędzi i budów. Konkretne egzemplarze (liczebniki, dostępność
  w lokalizacji źródłowej, niejednoznaczności) wybiera moduł Interpretacja w kodzie, testowany
  z podstawionym portem. Zmiana dostawcy dotyczy tylko adaptera.
- Dostawcy nie wysyłamy wartości narzędzi ani identyfikatorów z bazy: budowy mają krótkie oznaczenia
  (B1, B2…), narzędzia kody. Katalog czyta zapytanie Rejestru `toolCatalog`, które nie dotyka tabeli wartości.
- Klucz API organizacji jest w `OPENAI_API_KEY`, tylko po stronie serwera. Dane wysyłane przez API nie służą
  OpenAI do trenowania modeli, o ile organizacja sama się na to nie zgodzi; w ustawieniach organizacji
  w panelu OpenAI nie włączamy udostępniania danych. Każde zapytanie ma `store: false`, więc odpowiedź nie
  zostaje zapisana u dostawcy do późniejszego odczytu.
- Bez `OPENAI_API_KEY` wpis tekstem jest wyłączony. Lokalnie i w teście dymnym `TEXT_ENTRY_INTERPRETER=slowa`
  włącza prostą interpretację słowami kluczowymi, bez AI.

## Konsekwencje

- OpenAI może przetwarzać dane poza UE i przez pewien czas trzymać je do wykrywania nadużyć. Trzeba to ująć
  w polityce prywatności i umowie powierzenia (OpenAI jako podprocesor), a przed pierwszym płacącym klientem
  sprawdzić przechowywanie danych w Europie i zerową retencję na koncie OpenAI.
- Jakości rozumienia slangu nie sprawdzają testy jednostkowe. Zgodnie ze specyfikacją potrzebny jest osobny,
  ręcznie uruchamiany zestaw ewaluacyjny; zmiana promptu albo modelu bez niego to zmiana na ślepo.
- Wpis tekstem proponuje wydanie, zwrot i przeniesienie. Serwis obsługuje checklista.
