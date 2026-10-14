# 0047. Język interfejsu wybiera osoba, nie firma: konto, ciasteczko i t() bez zmiany wywołań

Data: 2026-10-14 · Status: przyjęta

## Kontekst

Na polskich budowach pracuje dużo osób z Ukrainy, Białorusi, Gruzji i spoza Europy. Aplikacja mówiła tylko po polsku.
Właściciel chce, żeby każdy mógł wybrać swój język: ukraiński, rosyjski, angielski, gruziński albo białoruski, i żeby
wybór jednej osoby nie zmieniał niczego innym w firmie. Teksty interfejsu są w `messages/pl.json` i czyta je
synchroniczne `t()`, wołane w ok. 190 plikach: w komponentach serwera i klienta, akcjach, trasach API, eksportach
i treści e-maili oraz powiadomień push. Adres z językiem (`/uk/...`, jak w przewodniku Next.js) nie pasuje: język to
cecha osoby, a linki z dzwonka, e-maili i plakatów mają działać każdemu.

## Decyzja

- Języki: `pl` (domyślny i jedyny pełny), `uk`, `ru`, `en`, `ka`, `be` (`src/i18n/locales.ts`). Tłumaczenia są w
  `messages/<język>.json` z tymi samymi kluczami co polski plik; czego brakuje, `t()` pokazuje po polsku.
- Wybór jest na koncie: `app.users.locale` (domyślnie `pl`), zmienia go sama osoba (`setLocale`, także w trybie tylko do
  odczytu). `Session.locale` niesie go dalej. W firmie demo konta są wspólne, więc Rejestr odmawia zapisu, sesja zawsze
  mówi po polsku, a język trzyma tylko przeglądarka.
- Przeglądarka trzyma go w ciasteczku `jezyk`. Ustawia je zapis na stronie Język (`/jezyk`, w menu każdej roli; u
  właściciela także w ustawieniach) i logowanie. Gdy konto ma inny język niż ciasteczko (zmiana na innym urządzeniu),
  layout aplikacji przestawia ciasteczko i raz przeładowuje stronę.
- `t()` się nie zmienia. Na serwerze język podaje moduł `src/i18n/server-locale.ts`, który rejestruje się przy starcie
  serwera (`src/instrumentation.ts`): bierze język wymuszony przez `withLocale`, a bez niego ciasteczko z magazynu
  żądania Next.js (`workUnitAsyncStorage`, z którego czyta też `cookies()`). Działa to w komponentach serwera, w renderze
  komponentów klienta na serwerze, w akcjach i w trasach API. W przeglądarce język i teksty ustawia `LocaleProvider`
  w głównym layoucie, zanim cokolwiek pod nim się wyrenderuje; teksty innego języka przychodzą od serwera, polski jest
  w paczce jak dotąd. Tytuły stron to `generateMetadata`, bo stała `metadata` liczy się raz przy imporcie.
- E-mail i push dostają tekst przy wysyłce, w języku adresata: Rejestr podaje go portowi powiadomień, a adapter
  renderuje treść w `withLocale`. E-maile do GP Engineering i plakat odbić (czcionka bez cyrylicy i gruzińskiego, plakat
  dla wszystkich na budowie) są zawsze po polsku.
- Po polsku zostają też: strona o programie, strony modułów, prawne dokumenty, panel super-admina, formularz
  „oddzwonimy”, nazwy pobieranych plików (nagłówek HTTP przyjmuje tylko ASCII) i nagłówki przykładowego pliku importu
  (import rozpoznaje kolumny po polskich nazwach). Liczby, kwoty i daty liczbowe mają zapis polski; nazwy miesięcy są
  w języku osoby.

## Konsekwencje

- Odczyt magazynu żądania to wewnętrzne API Next.js. Przy aktualizacji Next.js trzeba sprawdzić, że ciasteczko dalej
  zmienia język (test `src/i18n/messages.test.ts` sprawdza tylko `withLocale`, nie żądanie). Gdy API zniknie, `t()` nie
  padnie, tylko zacznie mówić po polsku.
- Teksty, które powstają raz i zostają w bazie (np. nazwa bazy „Baza”), są w języku z chwili zapisu.
- Liczebniki w tłumaczeniach wybiera polska reguła (1, 2–4, reszta), więc w ukraińskim, rosyjskim i białoruskim
  tłumaczenia omijają odmianę skrótem „дн.” tam, gdzie polska reguła dałaby złą formę.
- Głos i wpis tekstem rozpoznają dalej polski (rozpoznawanie mowy z językiem `pl`, nazwy narzędzi po polsku).
- Nowy tekst w `pl.json` bez tłumaczenia pokaże się po polsku; test tłumaczeń przypomni, że trzeba go dodać w pięciu
  plikach.
