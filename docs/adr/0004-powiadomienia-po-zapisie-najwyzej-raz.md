# 0004. Powiadomienia wysyłane po zapisie ruchu, najwyżej raz, bez kolejki

Data: 2026-09-26 · Status: przyjęta (do rewizji przy dzwonku, #38)

## Kontekst

Przeniesienie zabiera sprzęt z cudzej budowy, a jej kierownik ma dostać e-mail (#7). Wynik polecenia
„zarejestruj ruch” zawiera listę powiadomień, a wysyła je port powiadomień (kanał e-mail: Resend).
Polecenia ruchu są idempotentne: ponowne wysłanie tej samej operacji zwraca pierwotny wynik.

## Decyzja

- Rejestr wylicza powiadomienia z zapisanego ruchu w tej samej transakcji (kierownik budowy źródłowej,
  jeśli to nie on zabrał sprzęt i jego konto jest aktywne) i wysyła je dopiero po zatwierdzeniu.
- Wysyła tylko przy pierwszym zapisie operacji. Ponowienie (także równoległe) zwraca te same powiadomienia
  w wyniku, ale ich nie wysyła. Rejestr sprawdza ponowienie przed każdym poleceniem ruchu, w jednym miejscu.
- Błąd wysyłki nie cofa ruchu ani nie zmienia wyniku; trafia do logu serwera. Nie ma tabeli powiadomień
  ani kolejki ponowień.
- Resend dostaje klucz idempotencji (rodzaj, ruch, adresat), więc ponowiona wysyłka nie dotrze dwa razy.
- Bez `RESEND_API_KEY` (lokalnie, w CI) powiadomienia trafiają tylko do logu.

## Konsekwencje

- Powiadomienie może przepaść (awaria Resend, przerwana funkcja), ale nie przyjdzie podwójnie.
  Ewidencja ruchów jest źródłem prawdy, a e-mail tylko informuje.
- Cofnięcie przeniesienia nie wysyła nic: kierownik, któremu sprzęt wrócił, ma w skrzynce nieaktualny
  e-mail „nie odpowiadasz już za ten sprzęt”. Stan widać na tablicy; dopiszemy to razem z dzwonkiem.
- Polecenie czeka na wysyłkę (limit 10 s), więc przeniesienie trwa chwilę dłużej niż wydanie.
- Dzwonek (#38) ma być podstawowym kanałem zapisanym w bazie, a e-mail i push jego kopią. Wtedy
  powiadomienia trafią do tabeli w transakcji ruchu i będzie można je ponawiać.
