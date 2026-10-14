# 0046. Strony modułów pod `/funkcje` z treścią w plikach Markdown

Data: 2026-10-14 · Status: przyjęta (uzupełnia ADR 0021 i 0023)

## Kontekst

Do wyszukiwarki trafiała tylko strona o programie (ADR 0021). Jedna strona nie wypozycjonuje się naraz na „ewidencja
narzędzi”, „czas na budowie”, „badania i uprawnienia pracowników” i „terminy pojazdów”, a opis modułu w dwóch zdaniach
nie odpowiada na pytanie, jak funkcja działa. Teksty interfejsu z `messages/pl.json` trafiają do przeglądarki z każdym
komponentem klienta, który woła `t()` (ADR 0023), więc długie opisy nie mogą tam leżeć.

## Decyzja

- Każda grupa funkcji ze strony o programie (`FEATURE_GROUPS`) ma stronę modułu pod `/funkcje/<adres>`, np.
  `/funkcje/ewidencja-narzedzi`. Grupy i adresy są w `src/module-pages/pages.ts`; z tej listy biorą je trasa
  `src/app/funkcje/[modul]/page.tsx`, mapa strony, lista stron bez logowania (`visitorRoute`) i stopka.
- Treść jest w `messages/funkcje/<adres>.pl.md`, w tym samym podzbiorze Markdownu co dokumenty prawne
  (`src/markdown/parse.ts`, wspólny z `src/legal/parse.ts`). Nagłówek pliku ma `title` (tytuł w wynikach, do 42 znaków,
  bo layout dokłada „ · NarzędziownikGP”), `description` (110–160 znaków), `heading` (`h1`) i `lead`. Test
  `src/module-pages/read.test.ts` pilnuje długości, unikalności, kotwic i odnośników.
- Strony modułów mają `index`, własny adres kanoniczny i dane strukturalne `BreadcrumbList`. Cennik, pytania i kontakt
  zostają na stronie o programie; strona modułu do nich odsyła i ma ten sam nagłówek, pas kontaktu i stopkę
  (`src/components/visitor-site.tsx`).
- Strony dla odwiedzających nie wczytują pliku tłumaczeń do przeglądarki: formularz „oddzwonimy” i baner cookies dostają
  teksty od serwera w propsach, a `/oddzwonimy` zwraca gotowe podziękowanie.

## Konsekwencje

- Nowy moduł na stronie o programie to wpis w `MODULE_PAGES` i plik Markdown; bez pliku test i strona się nie wczytają.
- Opisy trzeba poprawiać razem z funkcjami: test nie sprawdzi, że tekst zgadza się z programem.
- Komponent klienta na stronie dla odwiedzających, który zawoła `t()`, znowu dołoży plik tłumaczeń (ok. 40 KB po
  kompresji) do jej JavaScriptu.
