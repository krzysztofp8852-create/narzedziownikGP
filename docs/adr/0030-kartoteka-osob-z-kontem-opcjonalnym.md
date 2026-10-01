# 0030. Kartoteka osób z kontem opcjonalnym

Data: 2026-10-01 · Status: przyjęta

## Kontekst

Do tej pory osobą w firmie było konto (`app.users`): ktoś, kto loguje się do programu. Moduły Ludzie i odbijanie
(#78) potrzebują też ludzi, którzy nigdy nie będą mieli konta: połowa brygady nie ma służbowego telefonu, a ich
badania, szkolenia BHP i czas na budowie właściciel też chce mieć w programie (#85). Taka osoba może później dostać
konto, a to, co zapisano przy niej wcześniej, nie może się wtedy rozjechać na dwa wpisy.

## Decyzja

- Nowa encja **osoba** (`app.people`): imię i nazwisko, notatka, aktywna albo nieaktywna i opcjonalne konto. Konto
  ma najwyżej jedną osobę, a osoba najwyżej jedno konto, z tej samej firmy (klucz obcy po parze konto–firma).
  Uprawnienia, odbicia i inne dane modułów wskazują osobę, a nie konto.
- Konto zawsze ma osobę. Migracja tworzy osobę dla każdego istniejącego konta (także dezaktywowanego, z jego stanem),
  a Rejestr dopisuje ją przy każdym nowym koncie: przy dodaniu osoby przez właściciela i przy zakładaniu firmy (osoba
  właściciela). Założenie konta osobie z kartoteki (`addPersonAccount`) podpina konto do niej, bez drugiego wpisu.
- Raz podpiętego konta nie da się odpiąć ani przepiąć (wyzwalacz), żeby dane osoby nie przeszły na kogoś innego.
- Imię i nazwisko osoby z kontem jest też nazwą konta: zmiana w kartotece (i podpięcie konta) przechodzi na konto
  (wyzwalacz), więc historia ruchów i nagłówek pokazują to samo co kartoteka. W firmie demo nazwy kont ról się nie
  zmienia, bo widzą je wszyscy oglądający.
- Dezaktywacja osoby z kontem dezaktywuje i blokuje konto (jak dotąd: nie konto właściciela, w demo żadnego),
  a dezaktywacja konta dezaktywuje jego osobę. Osoba z kontem jest aktywna razem z nim (wyzwalacz), a osoba bez konta
  po prostu przestaje być aktywna.
- Osoba bez konta nie zajmuje miejsca w pakiecie wdrożenia: limit osób zapisujących ruchy liczy dalej tylko konta
  (ADR 0024). Wpisanie całej brygady nic nie kosztuje.
- Kartotekę prowadzi i widzi właściciel (strona „Ludzie” zamiast sekcji „Zespół” w ustawieniach, z dotychczasowym
  zarządzaniem kontami). RLS daje każdemu jego własną osobę, pod przyszłe „moje uprawnienia” i „moje odbicia”.

## Konsekwencje

- Kolejne etapy rozszerzają widoczność kartoteki (kierownik zobaczy osoby przy uprawnieniach i odbijaniu) zmianą
  polityki `people_select`, bez zmiany modelu.
- Super-admin dopisuje osobę właściciela przy zakładaniu firmy, ale kartoteki nie czyta, więc identyfikator osoby
  nadaje Rejestr, a nie baza (`returning` wymagałby prawa odczytu).
- Usunięcie firmy usuwa osoby przed kontami (`COMPANY_TABLES`).
