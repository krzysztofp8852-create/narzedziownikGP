# 0001. Supabase w regionie eu-west-1 (Irlandia) zamiast Frankfurtu

Data: 2026-09-25 · Status: przyjęta

## Kontekst

Specyfikacja (#1, #2) zakładała projekt Supabase w UE, w regionie Frankfurt (`eu-central-1`),
obok funkcji Vercel w `fra1`. Projekt testowy powstał w `eu-west-1` (Irlandia).

## Decyzja

Zostajemy przy `eu-west-1`. Dane nadal są przechowywane w UE, więc wymóg RODO z historyjki 112
jest spełniony. Funkcje Vercel zostają w `fra1`, zgodnie ze specyfikacją.

## Konsekwencje

- Każde zapytanie Rejestru to podróż Frankfurt ↔ Irlandia (kilkanaście–kilkadziesiąt ms w obie
  strony). Strona robi kilka takich zapytań.
- Jeśli czas odpowiedzi zacznie przeszkadzać, można przenieść funkcje Vercel do `dub1` (Dublin),
  obok bazy. Wystarczy zmienić `regions` w `vercel.json`.
- Osobny projekt produkcyjny (zob. ADR 0002) zakładamy w tym samym regionie.
