# 0007. Dzwonek zapisywany w transakcji zdarzenia, e-mail tylko jako kopia

Data: 2026-09-27 · Status: przyjęta (zastępuje część ADR 0004)

## Kontekst

ADR 0004 wysyłał powiadomienie o zabranym sprzęcie tylko e-mailem, po zapisie ruchu, bez tabeli i bez
ponowień. Dzwonek (#38) ma być podstawowym kanałem powiadomień z licznikiem nieprzeczytanych i historią,
a e-mail i push (#22) jego kopią. Dochodzi zadanie dzienne: powiadomienia o przekroczeniu progu dni.

## Decyzja

- Powiadomienie to wiersz `app.notifications`: odbiorca, rodzaj, treść (dane zdarzenia z tamtej chwili,
  JSON), czas i `read_at`. Tekst i odnośnik składa interfejs (`src/lib/bell-text.ts`), tak jak treść e-maila.
- Rejestr zapisuje powiadomienie w tej samej transakcji co zdarzenie, więc nie przepada razem z przerwaną
  funkcją. Klucz zdarzenia (`dedupe_key`, np. ruch albo pobyt narzędzia) sprawia, że ponowienie operacji
  nie dubluje powiadomienia.
- Aktor nie widzi cudzego dzwonka (RLS), a `insert … on conflict` wymaga wglądu w istniejące wiersze, więc
  transakcja użytkownika pisze przez funkcję `app.deliver_notification` (SECURITY DEFINER), która sama
  ustala firmę aktora. Zadania systemowe piszą do tabeli wprost.
- Port powiadomień (`Notifier`) wysyła po zapisie kopię e-mailem, najwyżej raz, jak w ADR 0004. Na razie
  kopię ma tylko zabrany sprzęt; przekroczenie progu jest wyłącznie w dzwonku.
- Przekroczenie progu wykrywa codziennie o 5:00 UTC zadanie Vercel Cron (`/zadania/progi`, sekret
  `CRON_SECRET`). Narzędzie ma alarm tak jak na tablicy: dłużej niż próg dni firmy na aktywnej budowie.
  Zadanie bierze przekroczenia z ostatnich 48 godzin i zapisuje każdy pobyt (narzędzie + `located_since`)
  w `app.threshold_alerts` raz, więc następnego dnia nic się nie powtarza, a jedno pominięte uruchomienie
  niczego nie gubi. Kierownik budowy dostaje powiadomienie o każdym narzędziu, a każdy właściciel jedno
  zbiorcze z listą. Pojazdów jeszcze nie ma; zadanie patrzy tylko na budowy.

## Konsekwencje

- Próg obniżony przez właściciela nie zasypie dzwonka narzędziami, które przekroczyły nowy próg dawniej
  niż 48 godzin temu; widać je jako alarm na tablicy.
- Przerwa w zadaniu dłuższa niż dwie doby gubi przekroczenia z tego czasu (tablica nadal je pokazuje).
- Cofnięcie przeniesienia wciąż nie wysyła nic; kierownik ma w dzwonku nieaktualne powiadomienie.
- Vercel Hobby uruchamia zadanie raz dziennie z dokładnością do godziny, więc powiadomienie może przyjść
  między 5:00 a 6:00 UTC.
