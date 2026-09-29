# 0021. Strona o programie pod adresem głównym dla niezalogowanych

Data: 2026-09-29 · Status: przyjęta (uzupełnia ADR 0010)

## Kontekst

Niezalogowany na `/` trafiał od razu na logowanie, a jedyną stroną dla kogoś z zewnątrz było `/demo` (#59).
Link wysłany klientowi i wynik w wyszukiwarce mają pokazywać, czym jest program, z cennikiem, demo i kontaktem.
Zalogowany pod `/` ma dalej tablicę, a adres z naklejki QR dalej ma prowadzić przez logowanie do karty narzędzia.

## Decyzja

- Strona o programie jest w tej samej aplikacji, w `src/app/o-programie`. Proxy (`src/proxy.ts`) przepisuje na nią
  `/` bez sesji (GET i HEAD), więc w pasku adresu i w wyszukiwarce jest adres główny. Kto ruszy ją wprost pod
  `/o-programie`, też ją zobaczy; kanoniczny adres to `/`. Decyzję, co pokazać, podejmuje czysta funkcja
  `visitorRoute` (`src/lib/visitor-route.ts`), razem z listą stron dostępnych bez logowania.
- Wysłanie formularza na `/` bez sesji (akcja tablicy po wygaśnięciu sesji) prowadzi do logowania, a nie na stronę
  o programie, która takiej akcji nie zna.
- Ceny bierze z `TIERS` i `IMPLEMENTATION_FEE` w `src/registry/subscriptions.ts`, tych samych co w panelu super-admina.
- Do wyszukiwarki trafia tylko strona o programie: domyślne metadane w `src/app/layout.tsx` mają `noindex`, a strona
  o programie `index`. `robots.txt` i `sitemap.xml` są dostępne bez sesji. Adres w mapie strony i w podglądzie
  linku bierzemy z `APP_URL`, a bez niego z adresu produkcji na Vercelu. Obrazek podglądu `public/og.png` rysuje
  `scripts/generate-og-image.mts`.
- Service worker (ADR 0010) otwiera `/` jak tablicę. Stronę o programie poznaje po znaku `data-signed-out` i traktuje
  jak przekierowanie: kasuje kopię i nie zapisuje strony o programie w jej miejsce. Inna strona bez tablicy (bez
  `data-fetched-at`, np. przerwane renderowanie) zostawia starą kopię. Bez sieci i bez kopii niezalogowany zobaczy
  „Brak sieci”, a nie stronę o programie.

## Konsekwencje

- Strona o programie dzieli z aplikacją domenę i wdrożenie; własna domena produktu to tylko `APP_URL` i domena
  w Vercelu.
- Po wylogowaniu `/` pokazuje stronę o programie; wylogowanie dalej prowadzi prosto na `/logowanie`.
- Każde otwarcie `/` bez sesji przechodzi przez proxy (sprawdzenie sesji), tak jak dotąd przekierowanie.
