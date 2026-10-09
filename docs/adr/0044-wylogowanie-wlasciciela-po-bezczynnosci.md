# 0044. Wylogowanie właściciela po bezczynności: ustawienie firmy, aktywność na sesję w bazie

Data: 2026-10-09 · Status: przyjęta

## Kontekst

Sesja nie wygasa (ciasteczka 400 dni, odświeżanie bez końca), żeby telefon na budowie działał także bez zasięgu
(ADR 0008–0010). Właściciel widzi jednak wartości sprzętu i orzeczenia z badań lekarskich, często z komputera w biurze,
a informatyk klienta może wymagać wylogowania po bezczynności (#147). Limit sesji w Supabase Auth obejmuje cały projekt
i każdą rolę, więc zabrałby kierownikom pracę bez zasięgu.

## Decyzja

- Ustawienie firmy „Wylogowanie po bezczynności” (`companies.owner_idle_logout_minutes`: 15, 30, 60 albo 240 minut,
  domyślnie puste, czyli nigdy). Zmienia je właściciel i trafia do dziennika zmian (ADR 0043). Dotyczy tylko kont
  właściciela: `Session.idleLogoutMinutes` innych ról jest zawsze puste. W firmie demo konto właściciela dzielą wszyscy
  oglądający, więc tam ustawienia nie ma (ekran go nie pokazuje, a Rejestr traktuje je jak wyłączone).
- Bezczynność liczy się osobno dla każdej przeglądarki, czyli sesji Supabase Auth (`session_id` z JWT). Ostatnią
  aktywność zapisuje `app.session_activity` zegarem Rejestru. Bezczynność liczy się od najpóźniejszej z chwil:
  zalogowania (`amr` z JWT), zmiany ustawienia (`companies.owner_idle_logout_since`) i ostatniej aktywności. Zapis
  ustawienia nikogo więc od razu nie wyloguje (także właściciela pracującego w innej przeglądarce), a usunięty stary
  wiersz niczego nie przedłuża.
- Aktywnością jest ruch myszą, klawiatura, dotyk albo przewijanie w otwartej karcie: karta zgłasza ją `POST
  /aktywnosc` najwyżej raz na minutę (także ostatnią z minuty). Wejście na stronę ani zapytanie serwera samo w sobie nie
  jest aktywnością, więc odświeżanie w tle nie przedłuża sesji.
- `requireMember` (każda strona, akcja i plik aplikacji) prowadzi wygasłą przeglądarkę na `/wylogowanie`, które ją
  wylogowuje (tylko tę sesję, jak „Wyloguj”) i pokazuje logowanie z informacją o bezczynności. `/wylogowanie` nie
  wyloguje aktywnej sesji, więc link z zewnątrz nic nie zrobi.
- Otwarta karta pyta `GET /aktywnosc`, gdy minie czas od serwera, i po powrocie na ekran; gdy sesja wygasła, sama
  przechodzi do wylogowania, żeby dane nie zostały na ekranie. Aktywność w innej karcie odsuwa to pytanie. Bez sieci
  karta wychodzi, gdy w niej samej nikt nic nie robił przez cały ustawiony czas.
- Tablica właściciela z włączonym wylogowaniem nie zostaje w telefonie: HTML ma znak `data-no-copy`, a service worker
  i strona kasują kopię, zamiast ją zapisać. Kolejka offline działa jak dotąd.

## Konsekwencje

- Właściciel z włączonym wylogowaniem nie zobaczy tablicy bez sieci, także w telefonie. Kopia zapisana przed włączeniem
  znika przy najbliższym otwarciu tablicy z siecią; telefon, który do tej pory nie złapie sieci, ją pokaże.
- Karta pilnuje czasu tylko na stronach aplikacji; na zmianie hasła (bez danych firmy) wylogowanie przyjdzie przy
  zapisie. Karta otwarta przed włączeniem ustawienia sama nie wyjdzie, dopóki jej nie przeładować; wylogowanie przyjdzie
  przy jej pierwszym kroku po upływie czasu.
- Wejście na stronę bez ruchu w karcie (np. odnośnik otwarty w nowej karcie i zostawiony) nie liczy się jako
  aktywność. Bez sieci aktywność nie dociera na serwer, więc po powrocie sieci sesja może okazać się wygasła.
- Ponowne potwierdzenie logowania z 2FA (#145) nie zastępuje tego ustawienia: nie zamyka okna zostawionego w biurze.
- Wiersze `session_activity` zostają po wylogowaniu; starsze niż doba czyści zapis aktywności tej samej osoby, a z kontem
  znikają wszystkie. To nie dane firmy, więc nie ma ich w eksporcie (ADR 0042).
