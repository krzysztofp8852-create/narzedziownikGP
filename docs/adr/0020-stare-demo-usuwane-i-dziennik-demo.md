# 0020. Zastąpione demo znika w całości, a super-admin ma dziennik demo

Data: 2026-09-29 · Status: przyjęta (zmienia ADR 0017)

## Kontekst

Według ADR 0017 każde nowe demo zostawiało w bazie poprzednią firmę z dziewięcioma kontami, bo historia ruchów,
wątki zgłoszeń i czat z supportem tylko się dopisują. Przy odświeżaniu co godzinę panel super-admina zapełnia się
nieaktywnymi firmami „DemoBud”. Chcemy też wiedzieć, kto wchodzi do demo i co w nim robi, bo demo wysyłamy
zainteresowanym klientom.

## Decyzja

- Włączenie nowego demo usuwa każde zastąpione demo w całości: wiersze wszystkich tabel firmy (każda firma w osobnej
  transakcji systemowej), potem zdjęcia zgłoszeń, zdjęcia czatu i dokumenty terminów z kubełków, a na końcu konta
  Supabase Auth. Nieudane usunięcie zostawia firmę z zablokowanymi kontami do następnego demo.
- Wyzwalacze „tylko się dopisuje” przepuszczają `DELETE` wyłącznie w zastąpionym demo (`app.is_retired_demo`: firma
  z `demo_since` starszym niż ostatnie). Zwykła firma i obecne demo dalej mają historię nie do ruszenia, a użytkownicy
  i tak nie mają prawa usuwać tych wierszy.
- Listę tabel do usunięcia trzyma `src/registry/demo.ts`; test demo sprawdza, że po usunięciu w żadnej tabeli `app`
  z `company_id` nie zostaje nic z firmy, więc nowa tabela firmy bez wpisu na tę listę wywróci test.
- Dziennik demo (`app.demo_events`) zapisuje trzy rodzaje zdarzeń: wejście do roli (ze strony /demo albo paskiem demo,
  z rodzajem urządzenia z User-Agent), otwarty ekran (ścieżka bez parametrów, z komponentu w układzie aplikacji demo)
  i udane polecenie zapisu Rejestru (lista `LOGGED_DEMO_COMMANDS`). Zapisuje go tylko aktor systemowy, czyta tylko
  super-admin (RLS) na stronie `/super-admin/demo`: wizyty z 30 dni, od najnowszej, z przebiegiem.
- Wizyta to jedna przeglądarka. Każde wejście do roli to nowa sesja Supabase Auth, więc wejście pamięta sesję sprzed
  przełączenia i dziedziczy jej wizytę. Ekran należy do wizyty swojej sesji. Rejestr nie zna sesji przeglądarki,
  więc akcja trafia do wizyty, w której jej konto było ostatnio widziane.
- Bez ciasteczka śledzącego, adresu IP i danych oglądających: wystarcza sesja logowania, którą demo i tak ustawia.
- Zapis akcji kosztuje tylko demo: czy aktor jest w demo, wie już transakcja polecenia, a zwykła firma nie robi
  dodatkowego zapytania. Błąd zapisu dziennika trafia do logów i nie psuje ani wejścia, ani polecenia.
- Dziennik nie ma kluczy obcych i zostaje po usunięciu firmy demo. Konto usuniętego demo, do którego ktoś wszedł,
  dalej wraca na /demo (`isDemoAccount` pyta też dziennik), a nie na „Brak dostępu”.

## Konsekwencje

- Oglądający w poprzednim demo w chwili odświeżenia traci dane od razu, a nie tylko dostęp; wraca na /demo.
- Wątki czatu z wcześniejszych demo znikają z panelu super-admina razem z firmą.
- Kilku oglądających w tej samej roli naraz może pomieszać przypisanie akcji do wizyt; wejścia i ekrany przypisuje
  sesja, więc są dokładne.
- Dziennik rośnie z każdym ekranem i nic go nie czyści; strona pokazuje tylko 30 dni.
- Migracja z `app.demo_events` i `app.is_retired_demo` musi trafić do bazy przed wdrożeniem kodu.
