# 0002. Na razie jeden projekt Supabase dla środowiska testowego i produkcyjnego

Data: 2026-09-25 · Status: przyjęta (do rewizji przed pierwszym płacącym klientem)

## Kontekst

Specyfikacja (#1) zakłada dwa środowiska, testowe i produkcyjne, „każde z własnym projektem
Supabase”. Nie ma jeszcze żadnego klienta, więc drugi projekt nie jest na razie potrzebny.

## Decyzja

Vercel Preview (branche poza `main`) i Vercel Production (`main`) korzystają z tego samego
projektu Supabase, którego klucze są w `.env.local`.

## Konsekwencje

- Firmy zakładane przez lokalny test dymny (`npm run test:e2e`, nazwy „Test dymny …”) trafiają do
  tej samej bazy co produkcja. CI korzysta z własnego, jednorazowego Supabase (`supabase start`).
- Migracja wgrana przez `npm run db:push` od razu działa na produkcji, więc Preview nie chroni
  przed złą migracją.
- Przed pierwszym klientem zakładamy osobny projekt produkcyjny (ten sam region, zob. ADR 0001)
  i przestawiamy zmienne Vercel Production na jego klucze.
