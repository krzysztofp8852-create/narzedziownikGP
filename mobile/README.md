# NarzędziownikGP na Androida

Aplikacja do Google Play: cienka skorupa Capacitor 8, która ładuje program z https://narzedziownikgp.pl
(`server.url`, ADR 0038). Zmiany w programie dochodzą do aplikacji z wdrożeniem na Vercel; nowe wydanie w sklepie jest
potrzebne tylko przy zmianach natywnych (wtyczki, uprawnienia, ikony).

Ten katalog ma własne zależności i nie wchodzi do builda Next.js ani na Vercel (`.vercelignore`, `tsconfig.json`,
`eslint.config.mjs` w katalogu głównym).

- Pakiet `pl.narzedziownikgp.app` (nie da się go zmienić po pierwszym wydaniu), nazwa „NarzędziownikGP”.
- minSdk 24 (Android 7.0), targetSdk 36 (`android/variables.gradle`).
- Ikony i ekran startowy rysuje `npx tsx scripts/generate-icons.mts` (z katalogu głównego) z tego samego znaku co PWA.
- Uprawnienia (`android/app/src/main/AndroidManifest.xml`): aparat (skan QR), mikrofon (nagrania głosowe), położenie
  dokładne i przybliżone (odbicie), powiadomienia. O zgodę Android pyta przy pierwszym użyciu na stronie, nie przy
  starcie; o powiadomienia przy włączeniu przełącznika w dzwonku.
- Systemowy „wstecz” cofa w historii programu, a na stronie startowej (`/`) zamyka aplikację (`MainActivity.java`).
- Adresy spoza narzedziownikgp.pl (Mapy Google, `tel:`, `mailto:`, inne domeny) Capacitor otwiera w systemowych
  aplikacjach.
- Wtyczka `@capacitor/push-notifications` (`PushNotifications`): powiadomienia przez Firebase Cloud Messaging zamiast
  Web Push, którego WebView nie ma (zob. „Powiadomienia” niżej). Strona rejestruje token w dzwonku
  (`src/lib/push/app.ts`), a dotknięcie powiadomienia otwiera jego adres. Kanał „Powiadomienia” i ikonę na pasku
  (`ic_notification`, biały znak GP) zakłada skorupa.

## Wymagania

- Node.js 24
- JDK 21 (Gradle 8.14 nie uruchomi się na JDK 26; najprościej JDK dołączony do Android Studio)
- Android SDK z platformą 36 i build-tools: Android Studio albo same narzędzia wiersza poleceń. Ścieżkę podaje
  `ANDROID_HOME` albo plik `android/local.properties` (`sdk.dir=/Users/…/Library/Android/sdk`).

```bash
cd mobile
npm install
```

## Adres programu

`npx cap sync android` zapisuje konfigurację z `capacitor.config.ts` do projektu Android, także adres programu.
Domyślnie to produkcja. Do testów adres przestawia zmienna `CAP_SERVER_URL`, a po testach trzeba zrobić `sync` jeszcze
raz bez niej:

```bash
# lokalny serwer (npm run dev w katalogu głównym); telefon albo emulator przez USB
adb reverse tcp:3000 tcp:3000
CAP_SERVER_URL=http://localhost:3000 npx cap sync android

# podgląd z Vercela (wyłącz ochronę podglądów albo zaloguj się do Vercela w aplikacji)
CAP_SERVER_URL=https://narzedziownik-gp-git-galaz.vercel.app npx cap sync android

# z powrotem produkcja
npx cap sync android
```

`localhost` zamiast adresu IP komputera jest celowy: dla przeglądarki to bezpieczny kontekst, więc kamera, mikrofon
i położenie działają bez https. Z lokalnym Supabase dodaj `adb reverse tcp:54321 tcp:54321`.

## Powiadomienia (Firebase)

Do rejestracji w FCM aplikacja potrzebuje projektu Firebase na firmowym koncie Google z aplikacją Android
`pl.narzedziownikgp.app`. Z konsoli Firebase pobierz `google-services.json` do `android/app/google-services.json`
(nie jest sekretem, tylko wskazuje projekt) i zrób `npx cap sync android`. Bez tego pliku skorupa nie ładuje wtyczki
push (inaczej zamknęłaby się przy włączaniu powiadomień), a dzwonek pokazuje, że powiadomień tu nie ma. Przed
wydaniem do Google Play plik musi być na miejscu.

Wysyła serwer: klucz konta serwisowego Firebase (Ustawienia projektu → Konta usługi → Wygeneruj nowy klucz prywatny)
wklejony w całości do zmiennej `FIREBASE_SERVICE_ACCOUNT` na Vercelu (zob. README w katalogu głównym).

## Wersja debug

```bash
npx cap sync android
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Albo `npx cap run android` (wybór emulatora lub telefonu) czy `npx cap open android` (Android Studio). Stronę w aplikacji
debug podgląda się w Chrome na komputerze: `chrome://inspect`.

## Wydanie (podpisany AAB do Google Play)

Google trzyma klucz podpisu aplikacji (Play App Signing), a my klucz uploadowy, którym podpisujemy pakiet wysyłany do
Play Console. Klucz uploadowy i hasła są w firmowym menedżerze haseł, nigdy w repozytorium.

Jednorazowo, jeśli klucza jeszcze nie ma (potem do menedżera haseł):

```bash
keytool -genkeypair -v -keystore ~/narzedziownikgp-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Plik `android/keystore.properties` (jest w `.gitignore`):

```properties
storeFile=/Users/…/narzedziownikgp-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

Przed każdym wydaniem podnieś `versionCode` (o 1) i `versionName` w `android/app/build.gradle`, potem:

```bash
npx cap sync android
cd android
./gradlew bundleRelease
```

Wynik: `android/app/build/outputs/bundle/release/app-release.aab`, do ręcznego wgrania w Play Console. Bez
`keystore.properties` Gradle zbuduje AAB bez podpisu, którego Play Console nie przyjmie. Upewnij się, że ostatni `sync`
był bez `CAP_SERVER_URL`: adres programu siedzi w pakiecie.
