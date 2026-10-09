# 0042. Pełny eksport danych firmy jako ZIP z CSV każdej tabeli, plikami i README ze skryptu

Data: 2026-10-09 · Status: przyjęta

## Kontekst

Umowa o usługę (§ 6 ust. 2) obiecuje firmie na jej żądanie, w ciągu 14 dni, wszystkie jej dane w formacie do odczytu
maszynowego z opisem struktury, a zdjęcia i dokumenty w oryginalnych formatach. Tego samego wymaga prawo do zmiany
dostawcy z aktu w sprawie danych. Eksport do Excela w programie obejmuje tylko stan, historię, koszty i czas na budowie,
a pliki z kubełków zwracaliśmy ręcznie. Żądań jest mało, a termin to dni, nie minuty (#143).

## Decyzja

- Eksport przygotowuje GP Engineering skryptem `npm run company:export:prod -- --company <id> --out <katalog>`
  (aktor systemowy Rejestru, `system().exportCompany`), a nie przycisk w programie: bez nowego ekranu, uprawnień
  i limitów dla dużych plików, a przy kilku żądaniach w roku to wystarcza.
- Jeden ZIP: `dane/<tabela>.csv` dla każdej tabeli `app` z danymi firmy (także pustej), `pliki/<folder>/` ze zdjęciami
  zgłoszeń i czatu oraz dokumentami terminów i uprawnień, i `README.md`. Nazwy tabel i kolumn są jak w bazie, a README
  opisuje po polsku każdą kolumnę, jej typ i powiązanie (klucze obce czytane z katalogu bazy).
- CSV: RFC 4180, UTF-8 bez BOM, chwile w ISO 8601 w UTC, puste pole to brak wartości, a `""` pusty tekst. Format
  ma czytać program klienta albo nowego dostawcy, nie człowiek w Excelu (do tego jest eksport w programie).
- Plik nazywa się identyfikatorem wiersza, który na niego wskazuje (`pliki/zdjecia-zgloszen/<issues.id>.jpg`), a nie
  oryginalną nazwą: nazwy się powtarzają, a oryginalna jest w kolumnie `file_name`.
- Bez haseł i sesji (są w Supabase Auth, nie w `app`) i bez kluczy powiadomień push (adres, klucze i token
  subskrypcji); takie kolumny spec eksportu wymienia jako pominięte z powodem. Bez dziennika demo i dziennika
  usuniętych firm, bo to nie dane firmy.
- Dane z jednej migawki: transakcja `repeatable read, read only`, więc tabele są spójne, a eksport niczego nie zapisze.
  Nie zależy od abonamentu, więc działa w trybie tylko do odczytu i po końcu umowy, do usunięcia firmy (ADR 0025).
- Lista tabel i opisy kolumn są w `EXPORT_TABLES` (`src/registry/company-export.ts`). Testy porównują ją z katalogiem
  bazy jak testy usuwania firmy: nowa tabela z `company_id` albo kolumna bez opisu lub powodu pominięcia psuje test.

## Konsekwencje

- Każda migracja z nową tabelą albo kolumną danych firmy wymaga też opisu w `EXPORT_TABLES`.
- Plik, którego wiersz wskazuje, a w kubełku go nie ma, nie zatrzymuje eksportu; skrypt i README eksportu go wymieniają.
- ZIP zawiera dane osobowe ludzi firmy; przekazanie go klientowi i usunięcie lokalnej kopii jest ręczne (README).
- `fflate` (dotąd zależność bibliotek Excela) jest teraz bezpośrednią zależnością: pakuje ZIP strumieniowo na dysk.
