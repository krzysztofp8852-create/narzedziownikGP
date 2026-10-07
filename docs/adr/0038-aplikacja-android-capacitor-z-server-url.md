# 0038. Aplikacja Android w Google Play jako Capacitor z server.url

Data: 2026-10-07 · Status: przyjęta (zmienia zakres MVP z #1 dla Androida; uzupełnia ADR 0010)

## Kontekst

Spec MVP (#1) wyłączał z zakresu „aplikacje natywne w App Store i Google Play”: wystarczała instalowalna PWA (ADR 0010)
ze skanem QR kamerą, położeniem przy odbiciu, nagraniami, Web Push i kolejką offline. Przy sprzedaży to za mało (#116):
firma budowlana szuka „aplikacji” w Google Play, a „dodaj stronę do ekranu głównego z menu Chrome” trzeba tłumaczyć
każdemu kierownikowi. Research lokalizacji narzędzi nadajnikami
(`docs/research/nadajniki-ble-nawigacja-do-narzedzi.md`) pokazał, że Web Bluetooth nie nadaje się do produkcji, a pilot
„cieplej/zimniej” potrzebuje aplikacji natywnej (wariant A: Capacitor i `@capacitor-community/bluetooth-le`). Taka
aplikacja musi być u klientów zainstalowana, zanim dojdzie do niej BLE.

Program to server actions i React Server Components z sesją w ciasteczkach, bez REST API. Klient nie istnieje bez
serwera Next.js.

## Decyzja

- **Na Androida jest aplikacja w Google Play**: cienka skorupa Capacitor 8 (minSdk 24, targetSdk 36, wymóg Play od
  31.08.2026) w podkatalogu `mobile/` z własnymi zależnościami. Build Next.js i wdrożenie na Vercel jej nie dotykają.
  Pakiet `pl.narzedziownikgp.app`, nazwa „NarzędziownikGP”, ikony z tego samego znaku co PWA.
- **Skorupa ładuje produkcyjny program przez `server.url`** (https://narzedziownikgp.pl), a nie pliki wbudowane
  w aplikację. Wszystko, co działa w webie, działa w aplikacji, a zmiany przychodzą z wdrożeniem na Vercel. Nowe wydanie
  w sklepie jest potrzebne tylko przy zmianach natywnych (wtyczki, uprawnienia, ikony). Do testów adres przestawia
  zmienna `CAP_SERVER_URL` przy `npx cap sync` (lokalny serwer, podgląd).
- Skorupa zachowuje się jak aplikacja: systemowy „wstecz” cofa w historii WebView, a na stronie startowej zamyka
  aplikację; adresy spoza narzedziownikgp.pl (Mapy Google, `tel:`, `mailto:`, inne domeny) otwierają się w systemowych
  aplikacjach; sesja zostaje w ciasteczkach WebView po zamknięciu aplikacji. Uprawnienia aparatu, mikrofonu i położenia
  są w manifeście, a Capacitor prosi o nie przy pierwszym użyciu przez stronę (natywny skaner QR prosi o aparat sam,
  przy pierwszym skanie).
- **iPhone i komputer zostają przy PWA.** Bez App Store.
- Dystrybucja tylko przez Google Play (testy wewnętrzne, zamknięte, produkcja), z konta organizacji GP Engineering,
  z Play App Signing; my trzymamy tylko klucz uploadowy. AAB budujemy i podpisujemy ręcznie z terminala
  (`mobile/README.md`).

## Odrzucone alternatywy

- **TWA (Trusted Web Activity)**: najmniej pracy i pełny Chrome zamiast WebView, ale nie da się dodać BLE ani innych
  wtyczek natywnych. Przejście później na Capacitor tą samą nazwą pakietu jest możliwe, ale pilot BLE jest w planie,
  więc druga migracja byłaby stratą.
- **Osobne API i natywny frontend** (Capacitor z wbudowanym frontendem, React Native, Kotlin): miesiące pracy na
  przepisanie warstwy klienta z server actions na REST i dwa fronty do utrzymania przy każdej funkcji.
- **APK do pobrania ze strony**: ostrzeżenia Androida przy instalacji z nieznanych źródeł, brak automatycznych
  aktualizacji i wymóg weryfikacji deweloperów także poza sklepem. Klient i tak szuka w Google Play.

## Konsekwencje

- Dokumentacja Capacitora opisuje `server.url` jako tryb do live reload, „nie do produkcji”. Ryzyka i odpowiedzi:
  - bez sieci przy pierwszym otwarciu WebView pokazuje techniczny błąd: dojdzie własny ekran „Brak połączenia”
    w skorupie (#123); po pierwszym udanym starcie offline obsługuje istniejący service worker (ADR 0010);
  - wtyczki natywne w zainstalowanej aplikacji i strona wydają się niezależnie, więc strona przed użyciem wtyczki
    sprawdza, czy jest dostępna, i inaczej używa wersji webowej (#119);
  - większe ryzyko odrzucenia przez Google jako „opakowana strona”: łagodzą je natywny skaner, aparat, FCM, pobieranie
    plików i ekran offline (#120–#124);
  - wtyczki działają tylko na stronach z domeny `server.url`; inne domeny i tak otwierają się poza aplikacją.
- Adres programu siedzi w pakiecie (po `npx cap sync`), więc wydanie z adresem testowym trzeba złapać przed uploadem.
  Zmiana domeny programu wymaga nowego wydania w sklepie.
- Aplikacja ma osobną pamięć od Chrome: po instalacji trzeba się zalogować jeszcze raz.
- Polityka prywatności, umowa SaaS i formularz Data Safety muszą opisać aplikację (#127), a Google Play wymaga ścieżki
  usuwania konta (#125).
- BLE dojdzie jako aktualizacja tej samej aplikacji, z osobnym ADR, gdy będzie pilot.
