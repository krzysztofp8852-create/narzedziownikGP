# 0023. Dokumenty prawne jako pliki Markdown obok tłumaczeń, projekt oznaczony na stronie

Data: 2026-09-29 · Status: przyjęta

## Kontekst

Użytkownik ma mieć dostęp do regulaminu, polityki prywatności i umowy powierzenia (#26), z logowania i z ustawień.
Treść przygotowuje agent, a przed pierwszym płacącym klientem musi ją przejrzeć i poprawić prawnik. Teksty
interfejsu są w `messages/pl.json`, ale ten plik trafia do paczki JavaScriptu w przeglądarce (komponenty klienta
wołają `t()`), a trzy dokumenty to kilkadziesiąt kilobajtów, których żaden ekran aplikacji nie potrzebuje.
Prawnik ma też poprawiać tekst, a nie JSON z kluczami.

## Decyzja

- Treść jest w `messages/prawne/<id>.pl.md`, po jednym pliku na dokument i język, w małym podzbiorze Markdownu:
  nagłówek pliku (`title`, `version`, `draft: tak|nie`), `##` i `###`, akapity, punkty `1.` z wciętymi podpunktami `-`,
  listy `-`, `**wytłuszczenie**` i `[odnośniki](adres)`. Czyta go `parseLegalDocument` (`src/legal/parse.ts`), bez
  biblioteki Markdown. Krótkie teksty wokół dokumentów (nazwy, „Wróć”, ostrzeżenie o projekcie) są w `pl.json`.
- Strony `/regulamin`, `/polityka-prywatnosci` i `/umowa-powierzenia` renderuje serwer z pliku (`readLegalDocument`),
  więc treść nie trafia do przeglądarki jako JavaScript. `next.config.ts` dołącza pliki do wdrożenia.
- Strony są na liście stron bez logowania (`visitorRoute`), bo czyta się je przed założeniem konta. Mają domyślne
  `noindex`.
- Nagłówki mają kotwice bez polskich znaków („Załącznik 3. Podprocesorzy” → `#zalacznik-3-podprocesorzy`), żeby
  dokumenty mogły odsyłać do siebie nawzajem. Test sprawdza, że każdy taki odnośnik trafia w istniejący nagłówek.
- `draft: tak` pokazuje na stronie ostrzeżenie, że to projekt przed przeglądem prawnika. Po zatwierdzeniu treści
  prawnik (albo my po jego poprawkach) ustawia `draft: nie` i nową datę w `version`. Pytania do prawnika są
  w `docs/prawne/do-przegladu-prawnika.md`.

## Konsekwencje

- Kolejny język to kolejne pliki `<id>.<język>.md`; dziś `readLegalDocument` czyta tylko `pl`.
- Zapisu akceptacji regulaminu w programie nie ma: umowę zawiera się poza programem (oferta przyjęta e-mailem),
  a konto firmy zakłada super-admin.
- Zmiana dostawcy (np. transkrypcja przez ElevenLabs zamiast OpenAI, ADR 0006) wymaga zmiany załącznika 3 umowy
  powierzenia i uprzedzenia klientów 14 dni wcześniej, jak mówi § 5 tej umowy.
