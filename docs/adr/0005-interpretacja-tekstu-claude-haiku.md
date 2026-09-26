# 0005. Interpretacja wpisu tekstem: Claude Haiku 4.5 przez Anthropic API, bez trenowania na danych

Data: 2026-09-26 · Status: przyjęta (retencję i umowę powierzenia sprawdzić przed pierwszym płacącym klientem)

## Kontekst

Wpis tekstem (#15) zamienia zdanie kierownika („biorę dwie szlifierki i młot na Rataje”) w propozycję
ruchu. Specyfikacja (#1) wskazuje Claude Haiku 4.5 ze strukturalnym wyjściem i wymaga, żeby dostawca AI
był skonfigurowany bez trenowania na danych klienta. Do dostawcy trafia tekst wpisu i lista narzędzi
firmy (kod, nazwa, kategoria, lokalizacja) z nazwami aktywnych budów. Nazwisk kierowników ani wartości nie wysyłamy.

## Decyzja

- Port interpretacji (`src/interpretation/claude-interpreter.ts`) woła Anthropic API przez oficjalne SDK,
  model `claude-haiku-4-5`, z `output_config.format` (schemat JSON), więc odpowiedź zawsze ma kształt,
  którego oczekuje moduł.
- Model tylko dopasowuje frazy do narzędzi i budów. Konkretne egzemplarze (liczebniki, dostępność
  w lokalizacji źródłowej, niejednoznaczności) wybiera moduł Interpretacja w kodzie, testowany
  z podstawionym portem.
- Dostawcy nie wysyłamy wartości narzędzi ani identyfikatorów z bazy: budowy mają krótkie oznaczenia
  (B1, B2…), narzędzia kody. Katalog czyta zapytanie Rejestru `toolCatalog`, które nie dotyka tabeli wartości.
- Korzystamy z komercyjnego Anthropic API (klucz organizacji w `ANTHROPIC_API_KEY`, tylko po stronie serwera).
  Warunki komercyjne Anthropic wykluczają trenowanie modeli na danych wysyłanych przez API. W konsoli
  Anthropic nie włączamy niczego, co by to zmieniało (programy udostępniania danych, przekazywanie opinii
  z danymi).
- Bez `ANTHROPIC_API_KEY` wpis tekstem jest wyłączony. Lokalnie i w teście dymnym `TEXT_ENTRY_INTERPRETER=slowa`
  włącza prostą interpretację słowami kluczowymi, bez AI.

## Konsekwencje

- Anthropic przetwarza dane poza UE i przechowuje je przez okres swojej standardowej retencji. Trzeba to
  ująć w polityce prywatności i umowie powierzenia (Anthropic jako podprocesor) i przed pierwszym płacącym
  klientem rozważyć umowę o zerowej retencji.
- Jakości rozumienia slangu nie sprawdzają testy jednostkowe. Zgodnie ze specyfikacją potrzebny jest osobny,
  ręcznie uruchamiany zestaw ewaluacyjny; zmiana promptu albo modelu bez niego to zmiana na ślepo.
- Wpis tekstem proponuje wydanie, zwrot i przeniesienie. Serwis obsługuje checklista.
