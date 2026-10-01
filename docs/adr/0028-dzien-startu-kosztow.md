# 0028. Stawki dzienne z historią i dzień startu kosztów liczony wstecz

Data: 2026-10-01 · Status: przyjęta

## Kontekst

Koszt sprzętu budowy albo pojazdu (#80) to dni, w których narzędzie tam było, razy stawka dzienna. Dni wynikają
z historii ruchów, która sięga początku pracy firmy w programie. Stawka ma trzy poziomy: procent wartości dla
firmy, procent dla kategorii i kwota zł/dzień dla narzędzia, a stawka procentowa zależy od wartości narzędzia.

Właściciel chce dwóch rzeczy naraz: zobaczyć od razu koszt trwających i zakończonych budów, kiedy pierwszy raz
ustawi stawki, i nie zmieniać zestawienia za zamknięty miesiąc, które wysłał już inwestorowi, kiedy później zmieni
stawkę albo wartość narzędzia. Jedna bieżąca stawka bez historii psułaby to drugie, a stawka od dnia ustawienia to
pierwsze.

## Decyzja

- **Stawki i wartości mają historię obowiązywania.** `app.daily_rates` dopisuje każdy wpis stawki (firma, kategoria,
  narzędzie; pusty wpis zdejmuje nadpisanie) z dniem „obowiązuje od” w Polsce. `app.tool_value_history` dopisuje
  każdą zmianę wartości narzędzia (dodanie, edycja, import, akceptacja zgłoszenia; pusta, gdy wartość usunięto).
  Obie tabele tylko się dopisują. `app.tool_values` zostaje bieżącą wartością dla reszty programu.
- **Dzień startu kosztów** to dzień pierwszego wpisu stawki firmy: to ona daje stawkę każdemu narzędziu, więc
  kwota jednego narzędzia albo procent kategorii ustawione wcześniej nie uruchamiają kosztów. Wpisy stawek
  i wartości z dnia startu i sprzed niego obowiązują wstecz przez całą historię ruchów: z kilku liczy się ostatni.
  Każdy późniejszy wpis obowiązuje od swojego dnia, w całości (zmiana w ciągu dnia dotyczy całego dnia). Stawka
  równa obowiązującej niczego nie dopisuje.
- **Przed dniem startu** zapytanie o koszty zwraca stan „brak stawki”, a nie zera, a karta narzędzia nie ma
  stawki. Zakładka „Koszty” zachęca wtedy do ustawienia stawki firmy z podpowiedzią 1%.
- **Pierwszeństwo** w danym dniu: kwota narzędzia, procent kategorii, procent firmy. Procent liczy się od wartości
  z tego dnia; narzędzie bez wartości ma wtedy dni bez stawki, które nie wchodzą do kwoty.
- **Dni** liczy Rejestr z historii ruchów bez cofniętych (oryginał i cofnięcie pomijamy): każda rozpoczęta doba
  kalendarzowa w Polsce, w której narzędzie było na budowie albo pojeździe choćby chwilę; dzień przejścia A→B
  liczy się na obu. Pobyt kończy ruch wychodzący, korekta (od chwili zapisu), zaginięcie albo wycofanie, a trwający
  liczy się do dziś. Baza i serwis nie mają kosztów. Pomyłkę w dniach poprawia się korektą, nie edycją liczby dni.
- Stawki i historię wartości widzi i zapisuje tylko właściciel (RLS), jak wartości w zł. Kierownik za zgodą
  właściciela widzi je dla sprzętu swoich lokalizacji: ADR 0029.

## Konsekwencje

- Zestawienie za zamknięty okres nie zmienia się po zmianie stawki ani wartości, a pierwsze ustawienie od razu
  pokazuje koszt całej historii. Zmiana stawki w dniu startu nadal liczy się wstecz, więc właściciel może poprawić
  pierwszą stawkę tego samego dnia.
- Korekta albo ruch z kolejki offline z wcześniejszą chwilą zdarzenia mogą zmienić dni w zamkniętym okresie, bo
  historia ruchów jest źródłem dni. To zamierzone: zestawienie zawsze zgadza się z historią ruchów.
- Kategoria narzędzia nie ma historii: przeniesienie narzędzia do innej kategorii zmienia stawkę kategorii także
  w zamkniętych okresach. Kategorie zmienia się rzadko; gdyby to przeszkadzało, kategoria trafi do historii
  wartości narzędzia.
- Koszt liczy się przy każdym zapytaniu z całej historii narzędzi lokalizacji. Dla małych firm to szybkie; przy
  dużej historii można dodać projekcję pobytów bez zmiany reguł.
