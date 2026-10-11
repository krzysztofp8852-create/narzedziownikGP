# 0045. Anonimizacja osoby: nazwa zastępcza zamiast usuwania, w transakcji systemowej z autorem z JWT

Data: 2026-10-11 · Status: przyjęta (rozszerza ADR 0025 i 0043)

## Kontekst

Google Play wymaga, żeby aplikacja z kontami miała drogę do usunięcia konta w aplikacji i na stronie WWW (#116,
#125). Umowa powierzenia (§ 4 ust. 2) obiecuje usunąć albo zanonimizować w 30 dni dane osoby, których nie da się
usunąć funkcjami programu. Dezaktywacja tylko blokuje konto, a usunięcia osoby nie było, bo historia ruchów,
zgłoszeń, odbić i dziennik zmian tylko się dopisują i wskazują konto (`app.users`) albo osobę (`app.people`).
Usunięcie tych wierszy zepsułoby firmie ewidencję: nie wiedziałaby, kto wydał sprzęt i kto był na budowie.

## Decyzja

- Publiczna strona „Usuń konto” (`/usun-konto`, treść w `messages/prawne/usun-konto.pl.md`) mówi, czyich danych to
  dotyczy, do kogo pisać (właściciel firmy albo e-mail GP Engineering), w jakim terminie (30 dni) i co zostaje. Bez
  formularza i bez logowania. Jest na liście dokumentów prawnych, więc ma odnośnik wszędzie tam, gdzie one (logowanie,
  ustawienia, strona o programie), i w menu każdej roli. Samoobsługowego usuwania konta nie ma (poza zakresem #116).
- **Anonimizacja zamiast usuwania.** Osoba i jej konto zostają jako wiersze, na które wskazuje historia, ale:
  imię i nazwisko zastępuje nazwa zastępcza „Osoba zanonimizowana N” (kolejny numer w firmie), znika notatka,
  uprawnienia z dokumentami, e-mail i nazwa użytkownika, subskrypcje push, sesje, wpisy w dzwonku i oknie 📋, czat
  z supportem ze zdjęciami i konto Supabase Auth. Osoba i konto stają się nieaktywne (`anonymized_at` w obu tabelach).
  Ruchy, zgłoszenia, odbicia, czas na budowie i dziennik zmian pokazują nazwę zastępczą, bo czytają imię i nazwisko
  z osoby albo konta. Anonimizacji nie da się cofnąć.
- Wykonuje ją właściciel w swojej firmie (Ludzie) i super-admin w każdej (karta firmy → Osoby), po potwierdzeniu.
  Nie: kierownik, magazynier, pracownik, właściciel innej firmy. Nie da się zanonimizować konta właściciela (firma
  zostałaby bez niego; jego dane znikają z całą firmą, ADR 0025), osoby już zanonimizowanej ani osoby w firmie demo.
  Właściciel w trybie tylko do odczytu nie anonimizuje (jak każdy zapis), super-admin tak.
- **Transakcja systemowa z autorem z JWT.** Anonimizacja zmienia cudze wiersze (subskrypcje innej osoby, e-mail
  konta, dziennik zmian), do których `authenticated` nie ma praw, więc idzie w transakcji systemowej, która sama
  sprawdza rolę aktora (jak usunięcie firmy). Ustawia przy tym JWT aktora bez roli `authenticated`, tylko po to, żeby
  wyzwalacz dziennika zmian zapisał właściwego autora (ADR 0043). U właściciela najpierw transakcja aktora sprawdza
  sesję, tryb tylko do odczytu, demo i to, że RLS pokazuje mu tę osobę.
- **Dziennik zmian dostaje osobę** (`change_log.person_id`, bez klucza obcego). Nowe wpisy zapisują ją same, a stare
  migracja przypisuje po loginie zakładanego konta albo po imieniu i nazwisku, gdy w firmie jest dokładnie jedna taka
  osoba. Anonimizacja zamienia `person_name` na nazwę zastępczą i czyści `login` w wpisach tej osoby, a `actor_name`
  we wpisach, których była autorem. Wyzwalacz „tylko się dopisuje” przepuszcza tylko taką zmianę: inne kolumny bez
  zmian, nowe imię to nazwa zastępcza zanonimizowanej osoby, a login znika. Sama anonimizacja ma wpis
  `osoba_zanonimizowana`.
- W dzwonku innych osób imię i nazwisko zastępuje nazwa zastępcza tam, gdzie jest całą wartością w treści wpisu (np.
  kto zabrał sprzęt), nie fragmentem dłuższego tekstu.
- Konto Auth i pliki znikają po zatwierdzeniu transakcji; nieudane wracają jako pozostałości (błąd w logach), jak przy
  usunięciu firmy, a lista osób w panelu super-admina mówi, ile zostało. Konto w `app.users` traci przez to klucz obcy
  do `auth.users`.

## Konsekwencje

- Tekst wpisany ręcznie (opis zgłoszenia, komentarz, wyjaśnienie odbicia, transkrypcja ruchu głosem) zostaje taki,
  jaki był, nawet jeśli wymienia osobę. Strona „Usuń konto” mówi o tym i prosi o kontakt; taki tekst poprawia się
  ręcznie w bazie.
- Wpis dziennika sprzed migracji, któremu nie dało się przypisać osoby (imiennik w firmie, osoba spoza kartoteki),
  zostaje z imieniem i nazwiskiem; super-admin czyści go ręcznie, gdy prośba tego dotyczy.
- Powiadomienia e-mail wysłane przed anonimizacją (np. o zabranym sprzęcie) zostają u adresatów z imieniem
  i nazwiskiem; to poza programem.
- Dziennik audytu Supabase Auth (`auth.audit_log_entries`) może jeszcze zawierać e-mail osoby do czasu, aż Supabase
  go wyczyści; program go nie zmienia.
- Otwarte odbicie zanonimizowanej osoby zamyka się samo o północy „bez wyjścia”, jak u dezaktywowanej.
- Pozostawione konto Auth (nieudane usunięcie) nie wpuszcza do firmy, bo konto w `app.users` jest nieaktywne, ale
  blokuje swój e-mail; super-admin usuwa je ręcznie.
- Migracja musi trafić do bazy przed wdrożeniem kodu: Rejestr zapisuje już `change_log.person_id`.
