# 0037. Terminy pojazdu w tej samej tabeli co terminy narzędzi, dokumenty dla właściciela i kierownika pojazdu

Data: 2026-10-02 · Status: przyjęta (uzupełnia ADR 0019)

## Kontekst

Właściciel przegapia OC i przegląd busa, bo pojazd jest w programie tylko miejscem na sprzęt (#78, #92). Chce mieć
przy pojeździe numer rejestracyjny i VIN, pilnować przeglądu technicznego, OC, AC, legalizacji tachografu i własnych
terminów (np. wymiany opon), z dokumentami w telefonie przy kontroli drogowej, także dla osobówki bez sprzętu.
Terminy narzędzi (ADR 0019) mają już cykl, wykonanie, dokumenty, przypomnienia z wyprzedzeniem zależnym od rodzaju
(`reminder-lead.ts`), listę `/terminy` i sekcję raportu tygodniowego. Polisa ma dane właściciela pojazdu i nie musi jej
widzieć cała firma.

## Decyzja

- **Pojazd** (lokalizacja rodzaju `pojazd`) dostaje opcjonalne kolumny `registration_number` (wielkie litery i cyfry,
  pojedyncze spacje, do 12 znaków) i `vin` (17 znaków bez I, O i Q, inaczej `vin_invalid`). Wpisuje je właściciel przy
  dodaniu pojazdu albo w zakładce „Dane i terminy”. Osobówka bez sprzętu to zwykły pojazd; maszyny zostają narzędziami.
- **Termin pojazdu** to wiersz `app.tool_deadlines` z `vehicle_id` zamiast `tool_id` (dokładnie jedno z nich), a nie
  osobna tabela: cykl, wykonanie (`app.complete_tool_deadline`), dokumenty, przypomnienia (`app.deadline_alerts`),
  tryb tylko do odczytu, usuwanie firmy i zapytania listy działają bez drugiej kopii. Rodzaje pojazdu: przegląd
  techniczny, OC, AC, legalizacja tachografu i własny z nazwą; rodzaje narzędzi i pojazdów się nie mieszają (CHECK).
  Każdego rodzaju jest najwyżej jeden na pojazd, a własnych wiele, z nazwami różnymi bez względu na wielkość liter.
- Terminy pojazdu dodaje, zmienia, wykonuje i usuwa tylko właściciel (magazynier wpisuje wykonanie tylko terminów
  narzędzi, bo odbiera sprzęt z serwisu, a pojazdem do stacji kontroli jeździ kto inny). Termin dostaje tylko aktywny
  pojazd. Widzi je każdy w firmie, jak terminy narzędzi: data OC niczego nie zdradza.
- **Odnowienie polisy**: wykonanie OC i AC bez podanej daty liczy następny termin od końca obecnej polisy, jeśli w dniu
  odnowienia jeszcze trwała (nowa polisa zaczyna się po starej), a od dnia odnowienia, jeśli już wygasła. Przegląd
  techniczny, tachograf i własny termin liczą się od dnia wykonania, jak terminy narzędzi.
- **Dokumenty** terminów pojazdu (polisa, dowód rejestracyjny, protokół, faktura, inny) dołącza tylko właściciel,
  a widzą je właściciel i aktualny kierownik pojazdu (RLS przez `app.sees_deadline_documents`); fakturę dalej tylko
  właściciel. Pliki leżą w tym samym kubełku `dokumenty-narzedzi`.
- **Przypomnienia** z tabeli wyprzedzeń: 30 dni przed OC, AC i tachografem, 7 dni przed przeglądem technicznym
  i własnym terminem, i raz po terminie. Dostaje je właściciel (zbiorczo z terminami narzędzi) i kierownik pojazdu;
  nieaktywny pojazd nie przypomina. Zadanie dzienne szuka terminów na najdłuższe wyprzedzenie, czyli teraz 30 dni.
- Lista `/terminy` i raport tygodniowy pokazują terminy aktywnych pojazdów obok terminów narzędzi, z kierownikiem
  pojazdu jako odpowiedzialnym. W danych listy i dzwonka termin pojazdu ma `tool: null`, a `location` to sam pojazd.
  Strona pojazdu ma zakładkę „Dane i terminy” (`/pojazdy/[id]/terminy`) dla każdego w firmie.

## Konsekwencje

- Tabela zostaje pod nazwą `tool_deadlines`, choć trzyma też terminy pojazdów; zmiana nazwy dotknęłaby polityk,
  funkcji i usuwania firmy bez zysku dla zachowania.
- Kierownik, który przestał jeździć pojazdem, traci dostęp do jego polisy od razu ze zmianą kierownika.
- Termin pojazdu po dezaktywacji zostaje do wglądu na stronie pojazdu, ale nie przypomina i nie ma go na liście.
  Zmiana, wykonanie i nowy dokument dają `vehicle_inactive`; właściciel może go tylko usunąć.
- Przebieg, serwis według przebiegu i tankowania są poza zakresem; własny termin z nazwą pokrywa okresowe sprawy
  bez licznika.
- Migracja `vehicle_deadlines` musi trafić do bazy przed wdrożeniem kodu, bo lista terminów czyta nowe kolumny.
