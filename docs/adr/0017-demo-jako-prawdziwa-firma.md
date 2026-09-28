# 0017. Demo dla klientów to prawdziwa firma w bazie z wejściem bez hasła

Data: 2026-09-28 · Status: przyjęta

## Kontekst

Zainteresowanym klientom chcemy wysłać link, pod którym bez zakładania konta obejrzą aplikację w każdej roli
(właściciel, kierownik, magazynier, pracownik) na danych wyglądających jak działająca firma: sprzęt na budowach
i busach, alarmy, serwis, zgłoszenia, historia z kilku tygodni.

Makieta z danymi na sztywno rozjechałaby się z aplikacją przy pierwszej nowej funkcji. Osobna baza na każdego
oglądającego (np. PGlite w pamięci) nie działa na Vercelu, gdzie kolejne żądania trafiają do różnych instancji.

## Decyzja

- Demo to zwykła firma w tej samej bazie, z `app.companies.demo_since`. Obecne demo to firma, którą włączono
  ostatnio; `npm run demo:create` zakłada nową i dezaktywuje konta poprzedniej (historia ruchów tylko się dopisuje,
  więc starej firmy nie da się wyczyścić).
- Dane demo powstają przez Rejestr, z zegarem scenariusza cofniętym o sześć tygodni i bez powiadomień, więc
  przechodzą przez te same reguły co dane klientów (`src/demo/company.ts`, test na PGlite).
- `/demo` jest publiczne. Wybór roli loguje przeglądarkę na konto demo tej roli jednorazowym linkiem logowania,
  który serwer tworzy kluczem service_role i od razu wykorzystuje; hasła kont demo nikomu nie są potrzebne. W firmie
  demo pasek pod nagłówkiem przełącza role tą samą drogą.
- W demo Rejestr odmawia dezaktywacji konta i nadania hasła tymczasowego (`demo_locked`), bo odebrałyby rolę
  następnym oglądającym. Reszta działa jak u klienta.
- Na tablicy demo przewodnik (dymki przy elementach oznaczonych `data-tour`, osobne kroki dla każdej roli) włącza się
  sam przy pierwszym wejściu do roli. Krok, koniec i pominięcie pamięta tylko przeglądarka oglądającego (localStorage):
  pominięty nie włącza się sam w żadnej roli, a przycisk „Przewodnik” na pasku demo włącza go od początku.
- Konta demo mają adresy w domenie `demo.narzedziownik.gp-engineering.pl`, na które adapter e-mail nic nie wysyła.

## Konsekwencje

- Oglądający dzielą jedno demo i widzą nawzajem swoje zmiany; świeże demo to kolejne `npm run demo:create`.
- Każde demo zostawia w bazie nieaktywną firmę z kontami (także w panelu super-admina).
- Czat z supportem działa w demo naprawdę: wiadomość oglądającego trafia do nas jak od klienta.
- Wpis tekstem i głosem w demo korzysta z naszego klucza OpenAI, jak u klientów.
- Migracja z `demo_since` musi trafić do bazy przed wdrożeniem kodu, bo sesja każdego użytkownika czyta tę kolumnę.
