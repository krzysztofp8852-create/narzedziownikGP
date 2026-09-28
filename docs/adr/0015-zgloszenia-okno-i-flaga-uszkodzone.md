# 0015. Zgłoszenia: okno 📋 jako osobna skrzynka wpisów, flaga „uszkodzone” z wyzwalaczy, zdjęcie w Storage

Data: 2026-09-28 · Status: przyjęta (uzupełnia ADR 0007 i 0011)

## Kontekst

Każda osoba w firmie zgłasza właścicielowi uszkodzenie, brak lub zaginięcie albo inną sprawę (#37), z opisem
i opcjonalnym zdjęciem z telefonu. Zgłoszenie uszkodzenia od razu oznacza narzędzie jako uszkodzone, ale nie
blokuje ruchów. Zgłoszenia mają własne okno 📋 z licznikiem, osobne od 🔔 dzwonka, a push ma być kopią wpisu
z okna, jak przy dzwonku. Kto poza właścicielem i autorem widzi zgłoszenia, ustawia właściciel.

## Decyzja

- Okno 📋 to osobna tabela wpisów (`app.issue_entries`: nowe zgłoszenie, komentarz, zamknięcie, zgłoszenie
  narzędzia z #12), a nie rodzaj powiadomienia w dzwonku: ma własny licznik, a jego wpisy otwierają zgłoszenie,
  a nie „Pokaż”. Wpis zapisuje się w transakcji zdarzenia dla każdego, kto widzi zgłoszenie, poza sprawcą
  (autor dostaje komentarze i zamknięcie). Adresatów ustala funkcja w bazie (`app.deliver_issue_entries`), która
  przyjmuje tylko zdarzenia, których aktor jest sprawcą, i zwraca tylko nowe wpisy, więc ponowienie operacji nie
  daje drugiej kopii push (jak ADR 0011).
- Widoczność zgłoszenia liczy jedna funkcja w bazie (`app.sees_issue`) z bieżących ustawień firmy i bieżącego
  kierownika lokalizacji: używa jej polityka RLS i wybór adresatów wpisów. Zmiana ustawień działa od razu także
  wstecz, a wpisy o zgłoszeniach, których adresat już nie widzi, nie liczą się do licznika. Tak samo wpis
  o zgłoszonym narzędziu przestaje się liczyć, gdy ktokolwiek o nim zdecyduje.
- Przy narzędziu zgłoszenie zapamiętuje lokalizację, w której narzędzie było w chwili zgłoszenia: jej kierownik
  widzi zgłoszenie także wtedy, gdy narzędzie potem odjedzie.
- Flaga „uszkodzone” to data na narzędziu (`tools.damaged_since`). Ustawia ją wyzwalacz przy zapisie zgłoszenia
  uszkodzenia (drugie zgłoszenie zostawia pierwszą datę), a zdejmuje wyzwalacz ruchu z serwisu albo zamknięcia
  zgłoszenia z oceną „sprawne”, którą daje tylko właściciel. Nikt nie ma uprawnień do tej kolumny wprost.
- Zamknięcie to komentarz zamykający w wątku i zmiana statusu w jednej transakcji; baza nie zamknie zgłoszenia
  bez takiego komentarza. Wątek tylko się dopisuje, a zamkniętego zgłoszenia nie da się komentować ani otworzyć
  ponownie.
- Zdjęcie leży w prywatnym kubełku Storage `zdjecia-zgloszen` (port zdjęć Rejestru, jak kubełek nagrań), a nie
  w bazie: baza jest wspólna dla wszystkich firm i nie powinna rosnąć o pliki. Rejestr rozpoznaje format po
  treści pliku (JPG, PNG, WEBP do 4 MB) i zapisuje zdjęcie przed zatwierdzeniem transakcji; gdy transakcja się
  nie zatwierdzi, usuwa je. Telefon zmniejsza zdjęcie przed wysłaniem (dłuższy bok 1600 px). Zdjęcie pokazuje
  serwer (`/zgloszenia/<id>/zdjecie`) tylko temu, kto widzi zgłoszenie.
- Domyślnie zgłoszenia widzą kierownik lokalizacji i magazynier, a zamyka tylko właściciel.

## Konsekwencje

- Nowa osoba w firmie nie dostaje wpisów o zgłoszeniach sprzed swojego konta, ale widzi je na liście.
- Gdy zapis zdjęcia się uda, a zatwierdzenie transakcji nie i usunięcie też zawiedzie, w kubełku zostaje zdjęcie
  bez zgłoszenia (błąd w logu serwera).
- Cofnięcie ruchu z serwisu przywraca flagę z chwili przed tym ruchem (migracja `undo_restores_damage`: narzędzie
  ruchu z serwisu pamięta datę flagi, a ustawia ją tylko wyzwalacz). Pierwotnie cofnięcie jej nie przywracało,
  choć zgłoszenie uszkodzenia było dalej otwarte.
- Ocena „sprawne” zdejmuje flagę także wtedy, gdy narzędzie ma inne otwarte zgłoszenie uszkodzenia: decyduje
  właściciel, który zna oba.
- Wpis o zgłoszonym narzędziu jest nieprzeczytany, dopóki ktoś o nim nie zdecyduje (albo właściciel nie oznaczy
  wszystkich jako przeczytane): licznik mówi, ile spraw czeka na właściciela.
- Zamkniętego zgłoszenia nie da się komentować; gdy sprawa wraca, powstaje nowe zgłoszenie.
- Zgłoszenia narzędzi z budów rozpatruje się w oknie 📋; tablica tylko przypomina, ile czeka.
