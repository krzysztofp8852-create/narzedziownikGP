# 0013. Tryb tylko do odczytu pilnowany przez Rejestr transakcją READ ONLY

Data: 2026-09-28 · Status: przyjęta

## Kontekst

Firma, której abonament minął 14 dni temu (albo której super-admin włączył tryb ręcznie), ma dalej widzieć
tablicę, historię i eksport, ale nie może niczego zapisać (#25). Granica 14 dni liczy się dniami kalendarza
w Polsce według zegara Rejestru, tego samego, który pokazuje stan abonamentu w panelu super-admina i który
testy podstawiają. Poleceń zapisu jest kilkadziesiąt, a kolejne (zgłoszenia, #37) dojdą. Tabelę abonamentu
(NIP, adres, płatności) widzi z firmy tylko właściciel, a blokada dotyczy wszystkich ról.

## Decyzja

- Tryb liczy Rejestr przy wczytaniu sesji (`Session.company.readOnly`), z abonamentu z funkcji
  `app.current_company_plan()`: próg, „opłacone do”, tryb ręczny i liczba narzędzi, bez danych do faktury,
  dostępne w transakcji każdego członka firmy.
- Każda transakcja członka firmy ma rodzaj dostępu. Polecenie zapisu danych firmy (`write`) w trybie tylko do
  odczytu od razu odmawia błędem `read_only`, zanim sprawdzi dane czy założy konto w Auth. Zapytanie (`read`,
  domyślne) idzie w transakcji `SET TRANSACTION READ ONLY`: odczyty działają, a zapis, którego polecenie nie
  oznaczyło, odrzuci sama baza (SQLSTATE 25006), co Rejestr też zamienia na `read_only`. Nowe polecenie, które
  zapomni o oznaczeniu, jest więc zablokowane, tylko z mniej dokładnym komunikatem.
- Zawsze działają sprawy samego aktora (`personal`): zmiana hasła (inaczej osoba z hasłem tymczasowym nie
  zobaczyłaby nawet tablicy), oznaczanie dzwonka jako przeczytanego i subskrypcje push. Czat z supportem (#39)
  dołączy do nich.
- Super-admin i zadania harmonogramu nie przechodzą przez transakcję członka firmy, więc nie są blokowane.
- Ruch z kolejki offline odrzucony trybem tylko do odczytu czeka w telefonie (błąd do ponowienia), a nie trafia
  na listę „Do wyjaśnienia”: po wpłacie zapisze się sam.

## Konsekwencje

- RLS nie zna trybu tylko do odczytu. Ktoś z połączeniem do bazy jako członek firmy (poza Rejestrem) mógłby
  zapisać. Tak samo jest dziś z innymi regułami Rejestru (np. oknem cofnięcia), a aplikacja łączy się z bazą
  tylko przez Rejestr.
- Przekroczenie limitu narzędzi w progu niczego nie blokuje: polecenia, które dodają narzędzia (dodanie, import,
  zgłoszenie), zwracają `limitWarning` z proponowanym wyższym progiem.
- Nic nie kasuje danych firmy w trybie tylko do odczytu; wraca ona do pracy, gdy super-admin wpisze nowe
  „opłacone do” albo wyłączy tryb ręczny.
