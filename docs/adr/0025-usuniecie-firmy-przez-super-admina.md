# 0025. Super-admin usuwa firmę w całości, dopiero w trybie tylko do odczytu i po wpisaniu jej nazwy

Data: 2026-09-30 · Status: przyjęta (rozszerza ADR 0020)

## Kontekst

Umowa powierzenia (§ 9) każe po zakończeniu umowy usunąć albo zwrócić dane firmy na jej polecenie, w ciągu 30 dni,
z potwierdzeniem e-mailem. Do tej pory dało się to zrobić tylko ręcznie w bazie, bo historia ruchów, wątki zgłoszeń
i czat z supportem tylko się dopisują, a wyzwalacze przepuszczały `DELETE` wyłącznie w zastąpionym demo (ADR 0020).
Firmy testowe zakładane w panelu też zostawały na zawsze. Usunięcia nie da się cofnąć, więc pomyłka kosztowałaby
klienta całą ewidencję.

## Decyzja

- Na stronie firmy w panelu super-admina jest sekcja „Usunięcie firmy”. Usuwa wszystko, co usuwa zastąpione demo:
  wiersze wszystkich tabel firmy w jednej transakcji systemowej, potem zdjęcia zgłoszeń, zdjęcia czatu i dokumenty
  terminów z kubełków, a na końcu konta Supabase Auth. Lista tabel przeszła z `src/registry/demo.ts` do
  `src/registry/company-deletion.ts` i jest wspólna dla obu przypadków.
- Zabezpieczenia, wszystkie sprawdzane w Rejestrze, a nie tylko w formularzu:
  - tylko super-admin; usuwa aktor systemowy, bo RLS nikomu nie daje usuwać firm, więc rolę (`app.super_admins`)
    sprawdza ta sama transakcja systemowa, która usuwa,
  - tylko firma w trybie tylko do odczytu (ręcznym albo po 14 dniach od „opłacone do”), czyli w stanie po końcu umowy,
    w którym firma może jeszcze wyeksportować dane; aktywnej firmy nie usunie jedno kliknięcie,
  - nazwa firmy wpisana na potwierdzenie musi się zgadzać co do znaku (bez spacji na brzegach); przycisk jest
    nieaktywny, dopóki się nie zgadza, a formularz i Rejestr używają tej samej reguły (`confirmsCompanyName`),
  - firmy demo nie usuwa się z panelu (`demo_delete`), bo zastępuje ją nowe demo,
  - transakcja blokuje wiersze firmy i abonamentu, więc równoległe wyłączenie trybu tylko do odczytu, drugie
    usunięcie i każdy nowy wiersz z kluczem obcym do firmy czekają i widzą wynik. Blokuje też wątki czatu, bo czat
    działa w trybie tylko do odczytu, a wiadomość wskazuje wątek, nie firmę: wysyłana w tej chwili albo zapisze się
    przed usunięciem i zniknie z resztą, albo odpadnie po nim.
- Dziennik usuniętych firm (`app.company_deletions`: identyfikator, nazwa, kiedy i który super-admin) zostaje po
  usunięciu, bez kluczy obcych, do potwierdzenia klientowi wykonania polecenia (rozliczalność, art. 5 ust. 2 RODO).
  Bez NIP-u i danych osób: nazwa wystarcza, żeby wiedzieć, co usunięto, choć u jednoosobowej działalności zawiera
  imię i nazwisko. Czyta go tylko super-admin (RLS), zapisuje tylko aktor systemowy.
- Wpis w dzienniku powstaje w transakcji usunięcia, zanim znikną wiersze firmy, i to on odblokowuje wyzwalacze
  „tylko się dopisuje” (`app.is_purged_company`: zastąpione demo albo firma z wpisem). Nieudane usunięcie cofa wpis
  razem z resztą, więc historia firmy, która dalej istnieje, zostaje nie do ruszenia. Użytkownik firmy nie ma prawa
  pisać do dziennika.

## Konsekwencje

- Firmę testową usuwa się w dwóch krokach: włączenie trybu tylko do odczytu, potem nazwa i przycisk.
- Plik albo konto, którego nie udało się usunąć po zatwierdzeniu transakcji, zostaje osierocone (błąd w logach), ale
  nikogo nie wpuszcza: danych firmy już nie ma. Panel mówi wtedy, ile zostało, zamiast potwierdzać pełne usunięcie,
  bo super-admin usuwa je ręcznie przed potwierdzeniem klientowi, a zostawione konto blokuje swój e-mail.
- Dziennik usuniętych firm nie ma jeszcze widoku w panelu; na potwierdzenie dla klienta wystarcza zapytanie.
- Kopie zapasowe u podprocesorów wygasają w ich cyklu (umowa powierzenia, § 9).
- Migracja z `app.company_deletions` i `app.is_purged_company` musi trafić do bazy przed wdrożeniem kodu.
