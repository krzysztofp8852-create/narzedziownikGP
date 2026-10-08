# 0011. Push jako kopia każdego nowego wpisu dzwonka, wysyłana po zapisie

Data: 2026-09-27 · Status: przyjęta (uzupełnia ADR 0007)

## Kontekst

Użytkownik włącza powiadomienia na telefonie (#22), a kierownik, któremu ktoś zabrał sprzęt, dostaje push
oprócz e-maila. Push ma być kopią wpisów z 🔔 dzwonka (a później także 📋 zgłoszeń i 💬 czatu), a nie osobnym
źródłem powiadomień. Na iPhonie Web Push działa tylko w aplikacji dodanej do ekranu początkowego (iOS 16.4+).

## Decyzja

- Web Push to drugi kanał portu powiadomień (`Notifier.push`), obok e-maila. Rejestr podaje mu subskrypcję
  i wpis (`PushMessage`: okno i dane wpisu), a treść (ten sam tekst co w dzwonku) i adres składa adapter
  (`src/lib/web-push-notifier.ts`, biblioteka `web-push`, klucze VAPID z `VAPID_*`).
- Kopię dostaje każdy **nowy** wpis dzwonka: zapis w dzwonku (`app.deliver_notification` i zapis zadania
  systemowego) zwraca identyfikator tylko wtedy, gdy wpis powstał, więc ponowienie operacji i drugie
  uruchomienie zadania dziennego nie wyślą pusha drugi raz. Wysyłka idzie po zatwierdzeniu transakcji, najwyżej
  raz, jak e-mail (ADR 0004); błąd tylko odnotowujemy, bo wpis jest w dzwonku.
- Subskrypcja (`app.push_subscriptions`) to przeglądarka przypisana do osoby. Adres subskrypcji należy najwyżej
  do jednej osoby: włączenie powiadomień na telefonie, który miał ktoś inny, przepisuje go na aktora
  (funkcja `app.save_push_subscription`, bo RLS nie pokazuje cudzych wierszy). Subskrypcje adresatów czyta
  i wygasłe (404/410 od usługi push) usuwa transakcja systemowa.
- Przyjmujemy tylko adresy `https` znanych usług push (Google, Apple, Mozilla, Microsoft), bo serwer wysyła
  żądania pod adres z subskrypcji.
- Wylogowanie wyłącza push w przeglądarce i usuwa subskrypcję na serwerze; strona logowania wyłącza go
  w przeglądarce (sesja skończyła się bez wylogowania), więc na wspólnym telefonie następna osoba nie dostaje
  cudzych powiadomień. Dzwonek przy każdym otwarciu przypisuje włączoną subskrypcję zalogowanej osobie, a gdy
  subskrypcja ma stary klucz VAPID, zastępuje ją nową (zgoda już jest) i starą usuwa z serwera.
- Kliknięcie powiadomienia otwiera `/dzwonek/<id>`: jak „Pokaż”, wpis staje się przeczytany, a użytkownik
  trafia tam, dokąd wpis prowadzi. Service worker przenosi tam otwarte okno aplikacji albo otwiera nowe
  i nie otwiera adresów spoza aplikacji.
- Service worker pokazuje powiadomienie po każdym pushu, także bez treści, bo Safari cofa zgodę stronom,
  które dostają push i nic nie pokazują.
- Włączanie i wyłączanie jest w dzwonku; w Safari na iPhonie zamiast przycisku jest instrukcja dodania
  aplikacji do ekranu początkowego. Bez kluczy VAPID sekcji nie ma, a kopie trafiają tylko do logu.

## Konsekwencje

- Push może przepaść (usługa push nie odpowiada, telefon wyłączony dłużej niż doba: TTL 24 h), ale wpis jest
  w dzwonku.
- Po wylogowaniu i ponownym zalogowaniu powiadomienia trzeba włączyć jeszcze raz.
- Przeglądarka, która sama wymieni subskrypcję (`pushsubscriptionchange`), dostanie kopie dopiero po otwarciu
  dzwonka; stara wygaśnie przy pierwszej wysyłce.
- Wymiana kluczy VAPID unieważnia wszystkie subskrypcje. Usługi push odpowiadają wtedy zwykle 403, a nie 404/410,
  więc serwer ich sam nie usuwa (403 bywa też naszym błędem konfiguracji); telefon przechodzi na nowy klucz przy
  najbliższym otwarciu dzwonka, a do tej pory push do niego nie dochodzi.
- Kliknięcie powiadomienia po końcu sesji prowadzi przez logowanie, które wyłącza push w tej przeglądarce; po
  zalogowaniu trzeba go włączyć jeszcze raz.
- `/dzwonek/<id>` oznacza wpis jako przeczytany przy zwykłym otwarciu adresu (GET), bo tak otwiera go service
  worker. Identyfikator wpisu jest losowy i zna go tylko adresat, a obrazki i zapytania z cudzych stron idą bez ciasteczek sesji.
- 📋 Zgłoszenia (#37) i 💬 czat (#39) dopiszą swoje okna do `PushMessage` i wyślą kopie tą samą drogą.
- Rejestracja ruchu czeka na wysyłkę pushy (limit 10 s na przeglądarkę), równolegle z e-mailem.
- Aplikacja na Androida (ADR 0038, #122) nie ma Web Push w WebView, więc subskrypcja dostała rodzaj: przeglądarka
  (adres i klucze) albo aplikacja (token FCM, `app.save_app_push_subscription`). Kanał push portu powiadomień wybiera
  wysyłkę według rodzaju: Web Push albo FCM HTTP v1 (`src/lib/fcm-notifier.ts`, konto serwisowe Firebase
  w `FIREBASE_SERVICE_ACCOUNT`) z tą samą treścią, adresem, tagiem i TTL. Token wyrejestrowany, nieważny albo z innego
  projektu Firebase usuwamy jak subskrypcję po 404/410. Reguły (jedno urządzenie u jednej osoby, wylogowanie
  i strona logowania wyłączają push, demo bez push) są te same. W aplikacji token zapisuje się ponownie przy każdym
  starcie, bo FCM czasem go wymienia, a dotknięcie powiadomienia otwiera w aplikacji jego adres.
