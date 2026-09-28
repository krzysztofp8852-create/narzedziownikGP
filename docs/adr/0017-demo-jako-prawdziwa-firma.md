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
  przechodzą przez te same reguły co dane klientów (`src/demo/company.ts`, test na PGlite). Po drodze scenariusz
  robi to, co harmonogram z `vercel.json`, ale tylko dla tej firmy (`notifyCompanyExceededThresholds`,
  `sendCompanyDueReports`): codziennie progi dni, a w ostatnich dwóch tygodniach raporty. Świeże demo ma więc
  w dzwonku alarmy i raporty, zanim przyjdzie pierwszy cron.
- Co godzinę zadanie `/zadania/demo` zakłada świeże demo, jeśli ktoś wszedł do obecnego (wejście i przełączenie roli
  to logowanie, widać je w `auth.users.last_sign_in_at`), a od ostatniego wejścia minęło pół godziny. Do nieużywanego
  demo nie robi nic, bo każde nowe zostawia w bazie firmę z dziewięcioma kontami, a pół godziny chroni oglądającego
  przed wyrzuceniem w trakcie. Harmonogram jest w GitHub Actions (`.github/workflows/demo.yml`, ten sam
  `CRON_SECRET`), bo Vercel Hobby puszcza cron najwyżej raz dziennie.
- `/demo` jest publiczne. Wybór roli loguje przeglądarkę na konto demo tej roli jednorazowym linkiem logowania,
  który serwer tworzy kluczem service_role i od razu wykorzystuje; hasła kont demo nikomu nie są potrzebne. W firmie
  demo pasek pod nagłówkiem przełącza role tą samą drogą i zostaje na bieżącej stronie, jeśli widzi ją każda rola
  (tablica, historia, zgłoszenia, dzwonek, wyszukiwanie, karta narzędzia); inaczej wraca na tablicę. Nieudane
  wejście (np. błąd jednorazowego linku) wraca na `/demo` z komunikatem, a przyciski działają dalej.
- Wylogowanie kończy tylko sesję tej przeglądarki (`signOut({ scope: "local" })`). Domyślny zakres `global`
  unieważniał wszystkie sesje konta, czyli w demo wylogowywał wszystkich oglądających w tej roli. Konto demo
  po wylogowaniu wraca na `/demo`.
- W demo Rejestr odmawia dezaktywacji konta i nadania hasła tymczasowego (`demo_locked`), bo odebrałyby rolę
  następnym oglądającym. Reszta działa jak u klienta.
- Na tablicy demo przewodnik (dymki przy elementach oznaczonych `data-tour`, osobne kroki dla każdej roli) włącza się
  sam przy pierwszym wejściu do roli. Krok, koniec i pominięcie pamięta tylko przeglądarka oglądającego (localStorage):
  pominięty nie włącza się sam w żadnej roli, a przycisk „Przewodnik” na pasku demo włącza go od początku.
- Konta demo mają adresy w domenie `demo.narzedziownik.gp-engineering.pl`, na które adapter e-mail nic nie wysyła.
  Lista zespołu pokazuje zamiast nich „Konto demo”.
- Sprawy samego konta, które w demo dzieliliby wszyscy oglądający, są wyłączone. Okno 💬 nie pokazuje wspólnego
  wątku, tylko informację i kontakt handlowy, a Rejestr odmawia wiadomości i odczytu wątku (`demo_chat`): następny
  oglądający widziałby wiadomości poprzedniego i nasze odpowiedzi. Dzwonek nie pokazuje włączania powiadomień
  push, Rejestr odmawia subskrypcji (`demo_push`), a kopie push na konta firm demo nie wychodzą, także ze starych
  subskrypcji: telefon oglądającego dostawałby ruchy innych i codzienne alarmy, także po zmianie demo.

## Konsekwencje

- Oglądający dzielą jedno demo i widzą nawzajem swoje zmiany do najbliższego odświeżenia (najpóźniej około półtorej
  godziny po ostatnim wejściu); od razu świeże demo daje `npm run demo:create`. Kto ogląda jedną rolę dłużej niż pół
  godziny bez przełączania, może trafić na odświeżenie i wrócić na `/demo`.
- Każde demo zostawia w bazie nieaktywną firmę z kontami (także w panelu super-admina).
- Czatu z supportem ani powiadomień push nie da się w demo wypróbować; oglądający dostaje kontakt handlowy.
  Wątki z wcześniejszych demo zostają w panelu super-admina.
- Wpis tekstem i głosem w demo korzysta z naszego klucza OpenAI, jak u klientów.
- Migracja z `demo_since` musi trafić do bazy przed wdrożeniem kodu, bo sesja każdego użytkownika czyta tę kolumnę.
