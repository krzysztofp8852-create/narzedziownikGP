# Google Find Hub: tanie tagi + nieoficjalny dostęp do lokalizacji (GoogleFindMyTools i pochodne)

Data badania: **2026-09-29**. Ceny sprawdzone tego dnia, w walucie źródła. Przeliczenia orientacyjne, jak w poprzednich researchach
(1 EUR ≈ 4,25 zł; kursu dnia nie sprawdzałem). Pojęcia domenowe wg [CONTEXT.md](../../CONTEXT.md): **Narzędzie**, **Lokalizacja**
(baza, budowa, serwis, pojazd), **Ruch**.

Ten dokument jest trzecią ścieżką po [nadajniki-ble-nawigacja-do-narzedzi.md](nadajniki-ble-nawigacja-do-narzedzi.md) i
[przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md) (tagi BLE + bramki, za skomplikowane) oraz
[tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md) / [tanie-trackery-gt06.md](tanie-trackery-gt06.md) (GPS LTE-M, 300-500 zł/szt.).
Nie powtarzam tamtych ustaleń (protokoły BLE, 1NCE, Digital Matter, Traccar); porównanie kosztów jest w rozdz. 6.

Oznaczenia: **[Z]** zweryfikowane u źródła (repozytorium GitHub przez API/klon kodu, strona Google, strona producenta, sklep),
**[W]** tylko wyniki wyszukiwania, streszczenie strony, agregator cen albo źródło wtórne (recenzje, blogi),
**[?]** niezweryfikowane albo moja inferencja. Niczego nie uruchamiałem i nie logowałem się do żadnego konta; kod czytałem ze sklonowanego
repozytorium `leonboe1/GoogleFindMyTools` i przez `gh api`. Allegro i RTV Euro AGD zwracały 403, a Amazon.pl nie pokazał ceny,
więc **ceny polskie pochodzą głównie z Ceneo (agregator) i sklepu Ugreen EU** i są do potwierdzenia przy zakupie.

---

## 0. Podsumowanie

1. **Technicznie działa, ale to reverse engineering aplikacji Google, nie API.** Google potwierdza, że dla sieci Find Hub **nie ma SDK ani API**
   do odczytu lokalizacji [Z – [Partner Integration Guide](https://developers.google.com/nearby/fast-pair/landing-page-find-hub)]. Projekty
   udają aplikację Android (logowanie przez `gpsoauth`, żądania do `android.googleapis.com/nova` i `spot-pa.googleapis.com`, odpowiedzi przez FCM)
   i same odszyfrowują lokalizacje kluczem E2EE konta [Z – kod].
2. **Stabilność: jeden żywy ekosystem, ale kruchy.** Oryginał (`leonboe1/GoogleFindMyTools`, 1178 gwiazdek, GPL-3.0) ma **ostatni commit 2026-05-05**,
   74 otwarte issues i ok. 15 nieprzyjętych PR-ów [Z]: jest w praktyce **słabo utrzymywany**. Aktywnie rozwijana jest integracja Home Assistant
   (`BSkando/GoogleFindMy-HA`, 368 gwiazdek, release do v1.7.14 z 2026-07-18, gałąź 1.7 i forki z wydaniami do 2026-09-24) [Z] oraz jednoosobowy
   `GoogleFindMyToolsWebUi` (Docker, commity do 2026-09-21) [Z]. Google **już raz złamał narzędzie** (luty 2026, `API_KEY_ANDROID_APP_BLOCKED`);
   poprawka społeczności (PR #93) pojawiła się po ok. 2 dniach, a w `main` po 3 miesiącach [Z].
3. **Ryzyko konta jest realne, ale udokumentowane słabo.** Nie znalazłem zgłoszenia blokady konta ani wymuszonej zmiany hasła. Jest natomiast
   zgłoszenie **automatycznego wylogowania przez Google po kilku godzinach** ("Serious security warning", token AAS odrzucany jako `BadAuthentication`)
   [Z – BSkando #166]. Maintainerzy wskazują jako przyczyny IP z centrum danych i inny kraj niż miejsce logowania. **Konto Google Workspace
   nie działało** w zgłoszonym przypadku (E2EE unlock zawiesza się) [Z – leonboe1 #120]. ToS Google zabrania "bypassing our systems or protective measures"
   i dopuszcza zawieszenie konta [Z].
4. **Największy problem produktowy nie jest w kodzie, tylko w "ochronie przed niechcianym śledzeniem" (UTP).** Każdy certyfikowany tag, który jest
   długo oddzielony od telefonu właściciela, zaczyna **piszczeć przy ruchu**, a telefony Android w pobliżu dostają **"Unknown tracker alert"**
   (max jeden na tracker na dobę) [W/Z]. Nie da się tego wyłączyć, bo to wymóg certyfikacji [W – Chipolo]. Tagi na narzędziach w busie brygady
   będą to robić, chyba że w pobliżu jest telefon właściciela konta. Szczegóły w rozdz. 3 i 5.
5. **Tagi są tanie: Ugreen FineTrack G ok. 25 zł/szt. w 4-paku (99,99 zł), Slim G ok. 53 zł/szt. w 4-paku (49,99 EUR).** Ale FineTrack G ma
   akumulator 90 mAh, niewymienny, "1 rok", a jedyny niezależny test pokazuje **1-4 raporty dziennie** z sieci Google [Z – teardown]. Inne testy (Pebblebee, trasa Paryż-Rumunia-Barcelona)
   pokazują opóźnienia 1-7 minut [W], a blog o użyciu w praktyce ("rigacci.org") godziny lub dni poza miastem [W]. **Brak danych z budowy w Polsce.**
6. **TCO 200 narzędzi: ok. 5-11 tys. zł za tagi (kupno), plus komputer w biurze; GPS z poprzedniego researchu to ok. 130 tys. zł na 3 lata.**
   Dla 20-50 narzędzi: 0,5-2,8 tys. zł za tagi. Różnica jest ogromna, ale sygnał jest "kiedy ostatnio ktoś obcy przeszedł obok", nie "gdzie jest teraz".
7. **Rekomendacja (rozdz. 9):** pilotaż tak, ale **wąski, tani i ograniczony w czasie**: 5-10 tagów, jedno osobne konto Google (nie Workspace),
   uruchomione z sieci biurowej (nie VPS), przez `GoogleFindMyToolsWebUi` z HTTP-forwardem do Supabase Edge Function, z kryteriami go/no-go po 2-3 tygodniach.
   **Nie budować na tym funkcji sprzedawanej klientom SaaS** (rozdz. 7).

### Tabela A: projekty (stan na 2026-09-29)

| Projekt | Rola | Licencja | Ostatnia aktywność | Gwiazdki / issues | Uwierzytelnianie | Wyjście danych | Ocena |
|---|---|---|---|---|---|---|---|
| [leonboe1/GoogleFindMyTools](https://github.com/leonboe1/GoogleFindMyTools) | rdzeń: Python, CLI, ESP32/Zephyr firmware | GPL-3.0 (LICENSE), nagłówki plików: "All rights reserved" [Z] | commit **2026-05-05**, brak releases [Z] | 1178 / 74 otwartych [Z] | Chrome + `undetected-chromedriver`, `Auth/secrets.json` [Z] | konsola, `example_data_provider`; biblioteka [Z] | źródło wiedzy, słabo utrzymywany |
| [BSkando/GoogleFindMy-HA](https://github.com/BSkando/GoogleFindMy-HA) | integracja HA (custom component) | GPL-3.0 [Z] | push 2026-09-29, release **v1.7.14 (2026-07-18)**; forki 1.7.15.x do 2026-09-24 [Z] | 368 / 15 otwartych [Z] | `secrets.json` z narzędzia Leona wklejony do HA; opcjonalnie cookie OAuth do odnawiania tokenu AAS [Z] | encje `device_tracker` HA, nie MQTT/REST [Z] | najaktywniejszy, ale tylko dla Home Assistant |
| [P6g9YHK6/GoogleFindMyToolsWebUi](https://github.com/P6g9YHK6/GoogleFindMyToolsWebUi) | Docker + Web UI + forwarding HTTP | GPL-3.0 [Z] | commit 2026-09-05, push 2026-09-21 [Z] | 10 / 0 otwartych (fork Leona) [Z] | logowanie w przeglądarce w kontenerze (noVNC), `auth.yaml` szyfrowany opcjonalnie AES-256-GCM [Z] | **dowolny HTTP request per urządzenie, cron, Traccar/PhoneTrack, Apprise**, `/metrics` [Z] | **najprostszy do wpięcia w Supabase**, ale jeden autor |
| [txitxo0/googlefindmytools-homeassistant](https://github.com/txitxo0/googlefindmytools-homeassistant) | skrypt Python → MQTT z HA discovery | GPL-3.0 | **zarchiwizowany**, push 2025-11-01, "deprecated" na rzecz BSkando [Z] | 21 / 11 [Z] | jak u Leona (Chrome) [Z] | MQTT [Z] | nie używać |
| [Gulianrdgd/GoogleFindMy-HA](https://github.com/Gulianrdgd/GoogleFindMy-HA), [tomskra/…](https://github.com/tomskra/GoogleFindMy-HA), [totol123/…](https://github.com/totol123/GoogleFindMy-HA) | forki BSkando | GPL-3.0 | wydania 1.7.15.21 (2026-09-22), v1.7.15 (2026-09-24), brak wydań (2026-08-23) [Z] | 0 / 0 [Z] | jak BSkando | jak BSkando | forki bez społeczności, nie do produkcji |
| [luking-dev/findhub-tracker](https://github.com/luking-dev/findhub-tracker) | FastAPI + PostgreSQL/PostGIS + React, historia i mapa | brak licencji w metadanych [Z] | push 2026-09-24 [Z] | 0 / 1 [Z] | GoogleFindMyTools na hoście [Z] | własne REST API, minimum odpytywania 5 min [Z] | wzorzec architektury, nie zależność |
| [dylanmazurek/go-findmy](https://github.com/dylanmazurek/go-findmy) | Go: Nova, FCM, decryptor, publisher MQTT | brak (pole puste) [Z] | commit 2026-07-20 [Z] | 28 / 2 [Z] | ręczne pobranie tokenów, sekrety w HashiCorp Vault [Z] | MQTT [Z] | ciekawy, gdybyśmy chcieli Go; niedojrzały |
| [mheers/google-find-my-tools-go](https://github.com/mheers/google-find-my-tools-go) | Go, reimplementacja klienta | [?] | push 2026-09-15 [Z] | 0 [Z] | [?] | [?] | [?] za świeży |
| Biblioteki Node/npm | | | nie znalazłem żadnej dojrzałej [?] | | | | |

### Tabela B: tagi zgodne z Find Hub, ceny w Polsce (2026-09-29)

| Model | Cena PL (źródło) | Bateria | IP / rozmiar | Uwagi |
|---|---|---|---|---|
| **Ugreen FineTrack G (CM916)**, 4-pak | **99,99 zł = ok. 25 zł/szt.** (Ceneo, 1 oferta) [W] | akumulator Li-Po 3,8 V 90 mAh, USB-C, **niewymienny**, "1 rok" [Z – teardown] | IP nieokreślone w teardown [Z]; grubość ok. 9,45 mm [Z] | Bluetooth, bez UWB; głośnik piezo; chip InPlay IN610 [Z] |
| Ugreen FineTrack G (CM916), pojedynczy | **89,99-199,99 zł** (Ceneo, 2 oferty) [W]; osobny wpis "Smart Pro CM916, Find Hub / Apple" **49,90 zł** (1 oferta, niejasny wariant) [W] | j.w. | j.w. | rozrzut cen i niejasne warianty: sprawdzić przy zakupie |
| **Ugreen FineTrack Slim G** (karta do portfela) | **23,99 EUR (1 szt., przekreślone 29,99), 29,99 EUR (2), 39,99 EUR (3), 49,99 EUR (4, przekreślone 79,99)** = 102 / 127 / 170 / 212 zł, czyli **ok. 53 zł/szt. w 4-paku** (sklep eu.ugreen.com, 2026-09-29) [Z]; sklepu z PLN nie znalazłem [?] | niewymienna, "5 lat" [W – 9to5Google] | **IP68, 1,7 mm** [W] | cienki, do portfela, nie do narzędzia (kruchość [?]) |
| Chipolo Pop (Find Hub) | **99 zł** (Ceneo, 12-13 ofert), 4-pak 399 zł [W]; wariant Find Hub vs Find My nierozstrzygnięty [?] | [?] | głośność ok. 120 dB, zasięg BT do 90 m wg opisu [W] | marka z listy partnerów Google [W] |
| Motorola Moto Tag 2 (UWB) | **125-138 zł** (Ceneo) [W]; Moto Tag 1: 99 zł, 4-pak 299 zł [W] | [?] | UWB (precyzyjne "szukanie") [W – 9to5Google] | drożej, UWB nieistotne dla nas |
| Fresh 'n Rebel Smart Finder 2 / Logilink Smart Tag | **49,99-79,99 zł** / **54,99 zł** (Ceneo) [W] | [?] | [?] | reklamowane jako Find My **i** Find Hub, weryfikacja certyfikatu [?] |
| Pebblebee Clip / Tag / Universal | brak ofert w Ceneo [?]; ok. 34 USD / 37 EUR wg bloga (nie sklep PL) [W] | [?] | [?] | najlepiej oceniane w teście Android Authority [W] |
| Chipolo One Point, Sony, MiLi, Pixel Tag, no-name z AliExpress | **nie sprawdzone** [?] | | | AliExpress oferuje produkty "kompatybilne" bez pewności certyfikatu [W] |

---

## 1. Projekty: jak działają i co z tego wynika

### 1.1. Mechanizm (z kodu `leonboe1/GoogleFindMyTools`) [Z]

- **Logowanie**: `Auth/auth_flow.py` otwiera przez `undetected-chromedriver` stronę `accounts.google.com/EmbeddedSetup`, przechwytuje token OAuth,
  wymienia go przez `gpsoauth` na token AAS, a potem na tokeny zakresowe (`Auth/token_retrieval.py`, np. `oauth2:https://www.googleapis.com/auth/android_device_manager`).
- **Klucz E2EE**: `KeyBackup/shared_key_flow.py` otwiera `accounts.google.com/encryption/unlock/android?kdi=...` i wymaga wpisania PIN-u/wzoru
  **ekranu blokady telefonu Android**, który zna klucze konta. Bez wcześniejszej konfiguracji Find Hub na telefonie Android pojawia się
  "Your encryption data is locked on your device" [Z – README].
- **Pobieranie**: lista urządzeń i akcje przez **Nova API** (`https://android.googleapis.com/nova/...`, `NovaApi/nova_request.py`), żądanie
  `locateTracker` (`NovaApi/ExecuteAction/LocateTracker/location_request.py`), wyniki wracają **przez FCM** (`Auth/firebase_messaging`,
  rejestracja przez `android.clients.google.com/c2dm/register3`, `firebaseinstallations.googleapis.com`), a program odszyfrowuje je lokalnie
  (`decrypt_locations.py`). Dodatkowo **Spot API** (`spot-pa.googleapis.com`) do rejestracji własnych trackerów.
- **Ile trzeba telefonu**: telefon Android jest potrzebny **jednorazowo** do sparowania tagu (Fast Pair wymaga Androida 9+ [Z – Google spec])
  i do odblokowania kluczy E2EE (PIN). Odczyt lokalizacji **potem działa bez telefonu** (serwer + `secrets.json`); ale patrz UTP w rozdz. 3.
- **Ograniczenia znane z README**: brak wsparcia trackerów z krzywą P-256 i 32-bajtowymi reklamami (Sony WH-1000XM5), brak uwierzytelniania na ARM Linux,
  Chrome musi być aktualny, inaczej "will NOT work, guaranteed" [Z]. W HA-issue: JBL Tune 770NC nie deszyfruje (`Sx must be exactly 20 bytes (got 32)`) [Z].
  Tagi kupowane przez nas (Ugreen, Chipolo, Moto) nie są wymienione jako niewspierane; **nie potwierdziłem** dla Ugreen G w tych repo [?],
  choć użytkownicy HA raportują pracę z "UGREEN Finder Pro" [Z – BSkando #195].

### 1.2. Utrzymanie i awarie

- **`leonboe1`**: commity co kilka miesięcy (2025-11-08, 2026-02-06, 2026-05-05); PR-y z poprawkami (m.in. #114 "Fix decrypt failures, hanging waits, listener crashes",
  #122 "Reconnect FCM listener after it dies") czekają od sierpnia-września [Z]. Issue "Future of this repo" (#99): pytanie, czy Google zablokuje rejestrację [Z].
- **Awaria z lutego 2026 (#90)**: `API_KEY_ANDROID_APP_BLOCKED` przy `fcm_install`. Diagnoza społeczności: Google zaczął wymagać nagłówków z SHA1 certyfikatu aplikacji
  (poprawka: PR #93 `cert_sha1`), po 2 dniach potwierdzenia, że działa; w `main` scalone 2026-05-05 [Z]. **Wniosek: zmiany po stronie Google
  zdarzają się (co najmniej raz w 2026) i ktoś z community je łata w dni, a upstream w miesiące.**
- **BSkando HA**: wydania co kilka tygodni, CI (`mypy --strict`, pytest), mnóstwo commitów (3034 od `jleinenbach`, 473 od konta `claude`, 252 od BSkando) [Z];
  część kodu jest zatem współtworzona przez AI. Issues: przecieki pamięci po HA 2026.6, "Locate now/Play sound nie działają" (2026-08-31), brakujące urządzenia (2026-09-27),
  pęknięcia deszyfrowania dla nowych klas urządzeń (2026-09-24) [Z]. **Liczba otwartych 15**, wiele zamkniętych w ciągu dni: zdrowy projekt.
- **README BSkando** samo ostrzega: "Future upstream changes to Google's login flow may require updated tooling before the integration can connect again" [Z].
- **Bezpieczeństwo**: issue #214 (2026-08-18) "credential exposure, browser hardening, dependency and map access concerns" [Z]. WebUi: "holds long-lived Google account tokens…
  meant for local/LAN use" [Z]. To jest klucz do konta Google i do całej historii lokalizacji, więc konto ma być osobne (rozdz. 2).

### 1.3. Częstotliwość odświeżania i limity [Z, o ile nie zaznaczono]

| Projekt | Domyślnie | Zabezpieczenia |
|---|---|---|
| BSkando HA | odpytywanie co **300 s**, 5 s przerwy między urządzeniami, twardy minimum 60 s, stale po 3900 s, "Google Home filter" | sekwencyjne odpytywanie, debounce |
| WebUi | 300 s domyślnie, cron per urządzenie, `LOCATE_CONCURRENCY=5`, `LOCATE_TIMEOUT_S=60`, **globalny limiter 20 zapytań / 60 s** | pomijanie niezmienionych pozycji (haversine), "so a burst of manual clicks… can never combine into something that gets your account flagged" |
| findhub-tracker | min. 5 min | brak |
| Google (limity po ich stronie) | **nieznane** [?] | |

Odpytywanie nie tworzy nowych danych: tag raportuje lokalizację tylko wtedy, gdy przejdzie obok telefon Android. Odpytywanie częstsze niż co ok. 30-60 min dla 200 tagów
nie ma sensu (dla brygady wystarczy 1-2 razy dziennie na tag) i zwiększa ryzyko flagi. Zalecenie robocze [?]: rozłożyć zapytania w czasie, max kilka na minutę.

### 1.4. Jak najłatwiej do Supabase

Opcja 1 (**najprostsza, bez kodu**): `GoogleFindMyToolsWebUi` w Dockerze na komputerze w biurze; w "Forwarding Settings" każde urządzenie dostaje
"generic HTTP request builder" (metoda, URL z query, nagłówki, ciało) i własny cron [Z]. Cel: **Supabase Edge Function** `POST /findhub-ingest`
z nagłówkiem `Authorization` z wspólnym sekretem; funkcja waliduje sekret, mapuje `alias tagu → narzędzie` i zapisuje wiersz do tabeli `sygnaly_lokalizacji`
(tag_id, lat, lon, dokładność, czas z Google, czas odbioru, źródło). **Dokładne pola ciała i szablony zmiennych w WebUi trzeba sprawdzić w kodzie/dokumentacji przed użyciem** [?]
(README opisuje Traccar i PhoneTrack, nie opisuje Supabase).

Opcja 2 (**własny cron**): mały skrypt Python na bazie `leonboe1` (import jako biblioteki, `secrets.json` skopiowany na maszynę bez Chrome, jak opisuje README)
uruchamiany z `cron`/systemd co 30-60 min; zapis do Supabase przez REST (`service_role` tylko po stronie skryptu). Więcej pracy, ale pełna kontrola nad limitami i formatem.
Ryzyko: wiązanie z niestabilnym wewnętrznym API `leonboe1`, bez testów kontraktowych.

Opcja 3: **MQTT** (txitxo0, go-findmy, BSkando nie) + mostek do Supabase. Tylko jeśli MQTT byłby i tak potrzebny; dla nas dodatkowy element bez zysku.

Uwaga o **środowisku**: maintainerzy HA radzą uruchamiać skrypt logowania **z tego samego publicznego IP/kraju**, z którego potem działa integracja; **IP z centrum danych** (Hetzner, AWS, OVH…)
jest wskazywane jako najczęstsza przyczyna wylogowań [Z – BSkando README i #166]. Dlatego serwer ma stać w biurze (Raspberry Pi 5 / mini PC), nie na VPS ani w Vercelu.
Sama Edge Function (Supabase) nie rozmawia z Google, więc jej IP nie ma znaczenia.

---

## 2. Ryzyko konta i ToS

**Warunki Google** ([Terms of Service, zmiana 2026-07-30](https://policies.google.com/terms?hl=en)) [Z]:
- "You must not abuse, harm, interfere with, or disrupt our services or systems, for example by… **bypassing our systems or protective measures**."
- Zakaz "using automated means to access content… in violation of the machine-readable instructions on our web pages".
- Google "may suspend or terminate your access to the services or delete your Google Account" m.in. przy naruszeniu warunków i zachowaniach szkodliwych, jak "scraping content that doesn't belong to you".

To nie jest prawnicza opinia; **w mojej ocenie [?]** nieoficjalne wołanie prywatnych endpointów Nova/Spot i podszywanie się pod aplikację ADM (`gpsoauth`) mieści się w szarej
strefie "bypassing protective measures" i daje Google podstawę do zawieszenia konta. Odczyt **własnych** danych lokalizacyjnych własnego konta jest łagodniejszy niż scraping cudzych, ale nie jest to funkcja przewidziana przez Google.

**Zgłoszenia użytkowników** [Z]:
- BSkando **#166** (2026-05-21): dwa razy w kilka godzin od utworzenia `secrets.json` Google wylogował konto na "urządzeniu" e-mailem "Serious security warning",
  token AAS odrzucony jako `BadAuthentication`; HA wymusza ponowne logowanie. Konto miało 2FA, IP domowe w Niemczech (autor zgłoszenia). Maintainer: "Google's server-side auto-logout behavior";
  zalecenia: cookie OAuth do odnawiania tokenu, 2FA, spójna geografia, **osobne konto Google tylko do śledzenia**.
- **Nie znalazłem** w tych repo zgłoszeń o zablokowanym/zawieszonym koncie, captcha ani wymuszonej zmianie hasła (wyszukiwania issue po tych słowach dały 0-2 trafień, nietrafnych) [Z].
  Brak zgłoszeń nie oznacza braku ryzyka: skala użycia jest mała (setki, nie tysiące instalacji [?]).
- Wynik częściowy: post na forum HA (wrzesień 2025) nie opisuje blokad [W].

**Workspace**: nie znalazłem w dokumentacji Google (strona pomocy Find Hub) informacji, czy Find Hub działa na kontach firmowych/Workspace [?].
Zgłoszenie leonboe1 **#120** (2026-08-25): na koncie Workspace shared key flow zawiesza się po wpisaniu PIN-u; użytkownik obszedł to, przenosząc tagi na zwykłe konto Gmail;
autor drugiego rozwiązania nie odtworzył błędu (nie ma Workspace) [Z]. **Wniosek: zwykłe konto konsumenckie, założone przez właściciela na potrzeby pilotażu (2FA, dane odzyskiwania w firmie),
poza Workspace.** Zakładanie konta i ustawianie 2FA to czynność człowieka, nie moja.

**Praktyczne minimum ograniczające ryzyko** (źródła: README BSkando, WebUi):
1. Osobne konto Google tylko do Find Hub, żadnej poczty ani Drive'a na nim.
2. 2FA włączone; logowanie z sieci i kraju, w którym potem działa serwer.
3. Serwer w biurze, brak VPS; dostęp tylko LAN/VPN (WebUi domyślnie bez auth, ustawić `HTTP_USER`/`HTTP_PASSWORD`, `SECRETS_ENCRYPTION_KEY`).
4. Niski i rozłożony ruch (rozdz. 1.3).
5. Plan awaryjny: utrata konta = utrata dostępu do sparowanych tagów (trzeba je zresetować i sparować od nowa: fizyczna robota przy każdym).

---

## 3. Zmiany po stronie Google (2025-2026) i wpływ na tagi

- **Rebrand**: Find My Device Network → **Find Hub** (2025) [W – Wikipedia/9to5Google].
- **Nowe funkcje 2026** [W – 9to5Google guide]: "Mark as lost" wymaga biometrii (maj 2026), udostępnianie lokalizacji, zakładka "Remembered" z Gemini (wrzesień 2026),
  Moto Tag 2 z UWB, Google Pixel Tag, tagi Belkin, KeySmart, Chipolo, Pebblebee w różnych obudowach.
- **UWB nie jest wymagane**: Ugreen FineTrack G ma tylko Bluetooth (bez UWB i fine-ranging) i jest w Find Hub [Z – teardown]. Specyfikacja mówi tylko, że urządzenie
  z UWB musi wspierać konkretne konfiguracje [Z – [spec FMDN](https://developers.google.com/nearby/fast-pair/specifications/extensions/fmdn)].
- **Automatyczne włączanie sieci**: wg artykułu (Gadget Hacks, [W]) Google poszerzył automatyczne włączanie telefonów do sieci i wydłużył okno rezygnacji z 24 do 48 godzin
  (im więcej telefonów, tym lepsze pokrycie). Poziomy udziału telefonu wg ustawień: "bez sieci", "w miejscach o dużym natężeniu", "wszędzie" [W – rigacci]
  i README leonboe1 ("With network in all areas" / "high-traffic areas only") [Z].
  **Inferencja [?]:** telefony ustawione na "high-traffic areas only" nie będą raportować z placu budowy, więc zysk z telefonów brygady zależy od ich ustawień.
- **Unknown tracker alerts** [Z – [Google Help](https://support.google.com/android/answer/13658562?hl=en)]: alert dla telefonu Android, gdy nieznany tag "separated from its owner" porusza się razem z użytkownikiem;
  Google nie podaje progu czasu, mówi że trzeba fizycznie przemieszczać się z trackerem; **jeden alert na tracker na dobę**; odtworzenie dźwięku nie powiadamia właściciela.
- **Szyfrowanie i UTP w specyfikacji** [Z – [spec FMDN](https://developers.google.com/nearby/fast-pair/specifications/extensions/fmdn)]: E2EE lokalizacji, rotacja EID co ok. 1024 s (losowanie 1-204 s),
  w trybie UTP tag zmienia typ ramki i rzadziej rotuje adres MAC (raz na 24 h) po to, by być wykrywalnym; advertising co najmniej co 2 s, min. 0 dBm.
  Publiczna specyfikacja nie opisuje dostępu stron trzecich do raportów; udostępnia tylko dokument dla producentów sprzętu.
- **Oficjalne API**: **nie ma** (Google: "does not provide a specific SDK or API"); partnerstwa dotyczą **producentów tagów** (formularz zgłoszeniowy, certyfikacja w laboratorium)
  i, wg wyszukiwania, integracji logistyki bagażowej (SITA/Reunitus) [Z/W]. Nie znalazłem programu dla firm chcących odczytywać lokalizacje własnych tagów [?].
- **Udostępnianie tagów** [Z – [Google Help](https://support.google.com/android/answer/14800516?hl=en)]: właściciel może udostępnić tag do **10 osób** (Android 9+, akceptacja w 24 h, PIN 4-cyfrowy);
  po udostępnieniu lokalizacja pojawia się po kilku minutach. **Czy udostępnienie wyłącza UTP/alerty dla brygady: nie udokumentowano** [?].
- **Bezpieczeństwo tagów**: recenzent Android Police pokazał, że **kilka fizycznych naciśnięć tagu przenosi go na cudze konto** [W]. Dla narzędzi to znaczy: skradziony tag da się "przejąć",
  zanim ktokolwiek zobaczy alarm; i zostanie bez sygnału w naszym koncie.
- **Nie ma historii tras** w aplikacji Find Hub [W – Android Police]; ostatnia pozycja znika po 7 dniach bez wykrycia [W – rigacci.org]. Historię budujemy sami w Supabase.
- **Badania akademickie**: PETS 2025 "Okay Google, Where's My Tracker?" wykazało m.in. DoS i potencjalny atak łączący na Androidzie oraz porównało opóźnienia z Apple [Z – repo artefaktów, streszczenie];
  liczb opóźnień nie wyciągnąłem [?].

---

## 4. Tagi: Ugreen i konkurencja

### 4.1. Ugreen (zweryfikowane modele dla Google)

| Model | Numer | Bateria | Cena | Status |
|---|---|---|---|---|
| **FineTrack G** (Android) | CM916 / 65543P | Li-Po 3,8 V **90 mAh, niewymienna, ładowana USB-C (100 mA)**, deklarowany rok pracy [Z – teardown 2026-03-15, [Gough's Tech Zone](https://goughlui.com/2026/03/15/teardown-ugreen-finetrack-g-item-finder-for-google-find-hub-cm916-65543p/)] | 4-pak: **99,99 zł** (Ceneo) [W]; teardown: 4-pak AU$40 [Z] | "Google Certified" wg oferty Amazon.com [W] |
| **FineTrack Slim G** (karta) | – | niewymienna, "5 lat", IP68, 1,7 mm [W – [9to5Google](https://9to5google.com/2025/09/15/ugreen-android-find-hub-tracker-ultra-thin/)] | wg sklepu EU (EUR, 2026-09-29): **1 szt. 23,99; 2 szt. 29,99; 3 szt. 39,99; 4 szt. 49,99** [Z] | "officially Google Find Hub certified" wg wyszukiwania [W] |
| FineTrack Slim / FineTrack (bez G) | | wersje Apple Find My, akumulator | Amazon.pl 99,99 zł za wariant **Apple** [W] | **nie dla Find Hub**, nie kupować |
| FineTrack S (CM829) | | | x-kom 129,90 zł [Z] | dla Samsung SmartThings, **nie Find Hub** |

W teardownie: głośnik piezo z melodią, brak IP w dokumentacji, aktualizacje "one to four reports daily" z cudzych telefonów, w tłoku w ciągu ok. 10 min, jeden przypadek losowego dźwięku,
zasięg sieci Google "significantly less extensive than Apple" [Z – teardown]. Ugreen nie podaje IP dla FineTrack G [Z]. Wymiana baterii **niemożliwa** (lutowana), więc realny koszt cyklu życia to wymiana całego tagu co 1-2 lata lub ładowanie.

### 4.2. Konkurencja

- **Chipolo**: Pop 99 zł (Ceneo), 4-pak 399 zł [W]. Chipolo ma stronę o UTP w Find Hub i zaleca max 6 tagów na aplikację Androida (rekomendacja, nie limit) [W].
- **Motorola Moto Tag / Moto Tag 2**: 99-157 zł (Tag), 125-138 zł (Tag 2) [W]; UWB nieprzydatne.
- **Pebblebee** (Clip, Tag, Universal): najlepsze wyniki w teście trasy Paryż-Rumunia-Barcelona (aktualizacje w 1-4 minuty, max 7) [W – [Android Authority](https://www.androidauthority.com/shipped-apple-google-tile-bluetooth-trackers-europe-shocking-results-3647618/)]; cena w Polsce [?].
- **Fresh 'n Rebel / Logilink**: reklamowane jako Find My i Find Hub, 49,99-79,99 zł [W]; **certyfikat nie sprawdzony** [?].
- **No-name z AliExpress**: występują oferty "Compatible with Google Find Hub" oraz "Fakehub" [W]. Certyfikacja Google wymaga laboratorium zewnętrznego [Z], więc **bez wpisu na liście Google nie uznaję zgodności** [?]. Listy certyfikowanych produktów nie znalazłem w formie do porównania automatycznego (9to5Google publikuje "full list of supported devices", 2025-11-10 [W]).
- **Sony, MiLi, Pixel Tag, Chipolo One Point**: nie zweryfikowałem cen w PL [?].

### 4.3. Wybór do narzędzi

Do narzędzi (uderzenia, kurz, woda, metal) **Slim G (karta 1,7 mm) się nie nadaje jako przyczepiany** [?] (nie badałem wytrzymałości). Rozsądny kandydat cenowy do pilotażu: **FineTrack G 4-pak** (25 zł/szt.) do sprawdzenia
mechaniki i zasięgu + 1-2 tagi Chipolo Pop lub Pebblebee dla porównania jakości sieci/raportowania (Pebblebee ma najlepsze wyniki w teście [W]). IP i odporność FineTrack G [?].

---

## 5. Praktyczna dokładność w budowlance

Dane niezależne (nie marketing), z zastrzeżeniami: **żadne nie dotyczą budowy ani Polski.**

| Źródło | Warunki | Wynik |
|---|---|---|
| Android Authority, test transportu tagów Pebblebee Clip/Tag przez Francję, Rumunię, Hiszpanię [W] | podróż z użytkownikiem, duże lotniska, miasta | ostatnia aktualizacja 1-4 min, max 7 min; Chipolo (Find My) 41 min, Tile 91 min w jednym pomiarze |
| Gough's Tech Zone, Ugreen FineTrack G [Z] | Australia, zwykłe użycie | **1-4 raporty dziennie**, w tłoku ok. 10 min |
| rigacci.org, opis użycia tagów [W] | Włochy | centrum handlowe ok. 5 min; pojazd w mieście ok. 20 min; blok 1-6 h; dom podmiejski wiele godzin; wieś dni lub nigdy; pozycja znika po 7 dniach; Find Hub "regularly lags by hours" dla tagów nie w trybie zgubionym |
| Android Police [W] | centrum handlowe | Xiaomi Tag wskazał auto ponad 1000 stóp (ok. 300 m) od prawdziwej pozycji, GPS w metrach |
| Google Support Community, użytkownicy [W] | "tracker location not updating from contributors' phones" | godziny bez aktualizacji |

Wnioski robocze (moje, [?] tam, gdzie brak źródła):

- **Lokalizacja to raport z cudzego telefonu, który przeszedł obok w zasięgu BLE (rząd kilkunastu m; bez metalu)**, nie pozycja tagu. Dokładność to dokładność **telefonu, który go usłyszał**. Na budowie oznacza to: położenie **kogoś z Androidem z włączoną siecią**, w praktyce często brygada. Dobra wiadomość: telefony brygady mogą być tymi reporterami; zła: warunek, że mają Find Hub w trybie "wszędzie", a nie "w miejscach o dużym natężeniu" [?].
- **Metal** (skrzynia, kontener, bus) osłabia sygnał 2,4 GHz; nie znalazłem niezależnych pomiarów tłumienia dla tagów Find Hub [?]. W busie tag i tak jest "słyszany" przez telefon kierowcy/brygady, jeśli telefon jest w kabinie.
- **Opóźnienia**: nie planować funkcji "gdzie jest teraz". Realny sygnał to "ostatnio widziany o … w okolicy …", z możliwym zerem raportów przez dobę-kilka dni na odludziu (zgodnie z rigacci i teardownem).
- **Baza**: w magazynie tag "słyszy" telefon magazyniera i brygad wychodzących rano; sygnał "w bazie" jest wiarygodny, ale tylko z dokładnością do pomieszczenia i tylko gdy ktoś tam chodzi.

### 5.1. Unknown tracker alerts dla brygady (kluczowe)

- Tag ma tryb UTP: po dłuższej separacji od telefonu właściciela **zmienia zachowanie** (stały MAC na 24 h) i **piszczy przy ruchu**; obcy telefon z Androidem może wysłać alert
  "unknown tracker" (najwyżej raz na dobę na tracker) [Z – spec FMDN, Help; W – Chipolo/Pebblebee].
- **Nie można tego wyłączyć**: jest to obowiązkowy element certyfikacji Find Hub [W – Chipolo]. Konto na serwerze w biurze nie ma telefonu przy tagach, więc **wszystkie tagi będą "separated"** poza czasem, gdy w pobliżu jest telefon zalogowany na to konto.
- Realne zgłoszenia: użytkownicy HA raportują "random ringing" u Ugreen Finder Pro, Moto Tag 2, Tagigo; maintainer odpowiada, że to UTP, nie integracja (#195, #108) [Z].
- **Skutek dla brygady w busie**: powtarzające się alarmy w telefonach pracowników i piszczenie tagów w skrzyni (zależnie od ruchu i czasu separacji; progi Google nie są opisane [?]).
  Możliwe łagodzenia (wszystkie do sprawdzenia w pilotażu [?]): (a) telefon kierownika zalogowany na konto Find Hub jako "właściciel" przebywa w busie, (b) udostępnienie tagów brygadzie (Google pozwala do 10 osób, brak dowodu, że wyłącza alerty), (c) tag w torbie razem z telefonem nie działa dla narzędzi, (d) jeśli to nieakceptowalne, pilotaż kończymy.

---

## 6. TCO

Założenia: jednorazowy zakup tagów, komputer w biurze już jest (jeśli nie: Raspberry Pi 5 lub mini PC ok. 400-1000 zł [?]), Supabase istniejący, Edge Function: koszt zaniedbywalny
(limity darmowego planu nie sprawdzone [?]), brak abonamentu Google. Nie liczę pracy: parowanie 200 tagów przez Fast Pair na telefonie to ręczna robota (rzędu kilku godzin [?] moja ocena), przypisanie do narzędzi w aplikacji, montaż na sprzęcie, dla FineTrack G ładowanie co ok. rok.

| Wariant | 20 narzędzi | 50 narzędzi | 200 narzędzi | Uwagi |
|---|---|---|---|---|
| **Ugreen FineTrack G, 4-pak 99,99 zł** | ok. **500 zł** (5 paków) | ok. **1 300 zł** (13 paków) | ok. **5 000 zł** (50 paków) | dostępność: 1 oferta w Ceneo [W]; wymiana/ładowanie ok. co rok |
| **Ugreen Slim G, 4-pak 49,99 EUR** | ok. 1 060 zł | ok. 2 760 zł | ok. 10 600 zł | karta, "5 lat", nie do narzędzia [?] |
| Chipolo Pop 99 zł | ok. 1 980 zł | ok. 4 950 zł | ok. 19 800 zł | |
| Moto Tag 2, ok. 125 zł | ok. 2 500 zł | ok. 6 250 zł | ok. 25 000 zł | |
| Serwer (biuro) | 0-1 000 zł | jw. | jw. | Pi/mini PC, jednorazowo [?] |
| **GPS (Digital Matter, z [tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md)), 3 lata** | ok. **15-16 tys. zł** | ok. **34-35 tys. zł** | ok. **130 tys. zł** | LTE-M, GNSS + Wi-Fi, raporty z rozkładu 1-4 razy dziennie |

Ceny tagów przeliczone przez mnie z podanych cen jednostkowych i paków; do potwierdzenia przy zamówieniu (Ceneo, dostępność). Dla FineTrack G w scenariuszu 3-letnim doliczyć wymianę/ładowanie: ok. 3 × 5 000 zł = 15 000 zł za 200 szt., jeśli nie ładujemy, tylko kupujemy nowe [?].
Nawet wtedy tagi są kilkakrotnie tańsze niż GPS, **ale nie dają porównywalnej informacji**: GPS raportuje sam, tag zależy od cudzych telefonów.

---

## 7. Ocena ryzyka produktowego

**Użycie wewnętrzne** (nasza firma / pilotaż w jednej firmie klienta za jego zgodą): akceptowalne jako eksperyment z jasno opisanym ryzykiem.
Powody: brak oficjalnego API, ToS-szara strefa, konto może paść, projekty słabo utrzymywane, alerty UTP dla brygady, opóźnienia bez gwarancji.
Wartość: darmowy "ostatnio widziany" jako dodatek do ręcznej ewidencji.

**Sprzedaż jako funkcja SaaS**: **odradzam** [moja ocena, nie prawna].
1. Każdy klient musiałby założyć własne konto Google i **oddać nam (lub swojemu serwerowi) długo żyjące tokeny** do konta i klucz E2EE: to dane uwierzytelniające o dużej wrażliwości, a jednocześnie naruszenie ToS przez klienta, którego skutki (zawieszenie konta klienta) spadają na nas jako dostawcę.
2. Kruchość: jedna zmiana po stronie Google (jak w lutym 2026) wyłącza funkcję u wszystkich naraz, a poprawki zależą od wolontariuszy i AI-współtworzonych repozytoriów GPL.
3. Licencje: wszystko na GPL-3.0; używanie wewnętrzne bez dystrybucji nie zmusza do udostępniania kodu [?, sprawdzić prawnie], ale włączenie kodu do produktu SaaS/pakietu dla klientów już podchodzi pod dystrybucję. Nagłówki plików u Leona ("All rights reserved") są sprzeczne z GPL-3.0 w LICENSE [Z], co wymaga wyjaśnienia autora przed komercyjnym użyciem [?].
4. RODO: pozycje pracowników mogą być pośrednio ustalane z telefonów, które usłyszały tag (patrz [przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md), rozdz. o DPIA i art. 22³ KP); tu telefony są cudze i anonimowe, ale ślad narzędzia w busie pokazuje trasę kierownika.
5. Brak SLA i brak zapewnionej aktualności. Nie damy klientowi gwarancji częstotliwości.

**Jak ograniczyć ryzyko, jeśli jednak zbudujemy wersję wewnętrzną:**
- Warstwa abstrakcji **"Źródło sygnału"**: tabela `sygnaly_lokalizacji` (narzędzie, źródło, lat/lon lub Lokalizacja, dokładność, czas z urządzenia, czas odbioru) z polem `zrodlo` = `reczny` / `findhub` / `gps_webhook` / `ble_gateway`. Aplikacja czyta tylko z warstwy, nie zna Google.
- **Sygnał nie tworzy Ruchu**: pozycja z Find Hub jest **sugestią** ("ostatnio widziany ~12 km od Budowy X, 6 h temu"), Ruch zawsze rejestruje człowiek (zgodnie z modelem domenowym: Ruch = zdarzenie ewidencyjne).
- Ewidencja ręczna jest **zawsze** źródłem prawdy; sygnał nie może zmienić Lokalizacji Narzędzia sam.
- Wyłącznik (feature flag) per firma i monitorowanie zdrowia: alarm dla super-admina, gdy 0 raportów z >X tagów przez 24 h lub gdy WebUi zgłasza wygasły token.
- Możliwość wymiany źródła na GPS z [tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md) bez zmian w UI.

---

## 8. Najprostsza integracja z naszym Supabase

Nowa tabela wchodziłaby zwykłą migracją; poniżej tylko schemat koncepcyjny (bez implementacji, nie zmieniam kodu repo).

```
[tag BLE] --(telefon Android obok)--> Google Find Hub (E2EE)
                                              |
        Mini PC w biurze (Docker: GoogleFindMyToolsWebUi, LAN/VPN, konto Google #osobne)
          cron per tag co 30-60 min, HTTP forward ------------------+
                                                                    v
                      Supabase Edge Function /findhub-ingest (sekret w nagłówku)
                          alias tagu -> narzedzie_id, dopasowanie do Lokalizacji (geofence)
                                                                    v
                      tabela sygnaly_lokalizacji (RLS: firma_id) -> widok "Ostatnio widziany"
```

Kroki pilotażowe (kolejność):
1. Konto konsumenckie + Android do jednorazowego sparowania i odblokowania kluczy (człowiek).
2. Docker `ghcr.io/p6g9yhk6/googlefindmytools` w biurze, `HTTP_USER/PASSWORD`, `SECRETS_ENCRYPTION_KEY`, logowanie przez wbudowaną przeglądarkę (noVNC) [Z – README].
3. Aliasy urządzeń w WebUi = kody Narzędzi z aplikacji.
4. Edge Function przyjmuje ciało z WebUi (zweryfikować format przed pisaniem [?]), zapisuje, ignoruje duplikaty (ta sama pozycja i czas).
5. Widok w UI: "ostatnio widziany" jako szara sugestia, bez wpływu na Lokalizację.

---

## 9. Rekomendacja

**Tak, pilotaż warto zrobić, ale jako mały eksperyment na zakładanie porażki, nie jako fundament produktu.** Koszt to poniżej 1 000 zł i kilkanaście godzin pracy,
a odpowiada na pytanie, którego żaden inny research nie rozstrzygnie: ile realnych raportów daje sieć Google na polskiej budowie.

**Zakres:**
- **5-10 tagów**: 1 lub 2 × Ugreen FineTrack G 4-pak (99,99 zł każdy), 2 × Chipolo Pop lub Pebblebee (ok. 200-300 zł; do porównania jakości). Slim G pominąć (karta, nie do narzędzi).
- **1 konto Google**: nowe, konsumenckie, 2FA, poza Workspace; zapisane w firmie jako aktywo (dane odzyskiwania).
- **Projekt**: **`P6g9YHK6/GoogleFindMyToolsWebUi`** (HTTP-forward, cron, throttle, szyfrowanie sekretów), ze świadomością: jeden autor, 10 gwiazdek, GPL-3.0. Zapasowo: sam rdzeń `leonboe1/GoogleFindMyTools` jako biblioteka i własny cron, ponieważ WebUi jest jego forkiem i dzieli jego krytyczne zależności (łatka SHA1 z PR #93 jest w `main`).
- **Środowisko**: mini PC/RPi w biurze, nie VPS, nie Vercel.
- **Integracja**: Edge Function `/findhub-ingest` → tabela `sygnaly_lokalizacji` → "ostatnio widziany" jako sugestia (rozdz. 8).
- **Czas**: 3 tygodnie. Tagi: 2 na narzędziach w metalowej skrzyni busa, 2 na sprzęcie w bazie, 2-3 na narzędziach na aktywnej budowie, 1 w biurze jako kontrola.
- **Kryteria go/no-go** (moje propozycje, do ustalenia z właścicielem [?]): (1) ≥ 70% tagów z raportem w ciągu 24 h w dni robocze; (2) mediana wieku raportu < 6 h dla bazy i busa; (3) konto nie zostało wylogowane/ostrzeżone w tych 3 tygodniach (lub tylko raz i odnowione bez utraty sparowania); (4) alerty "unknown tracker" nie wywołały skarg brygady albo dały się zażegnać zalecaną praktyką; (5) tagi przetrwały montaż na narzędziach.
- **Nie robić**: pilotażu na kontach klientów, sprzedaży funkcji, dokumentowania jej w cenniku, ani przechowywania tokenów Google na serwerach dostawcy.

Jeśli pilotaż wypadnie źle (najbardziej prawdopodobne pułapki: wylogowania, opóźnienia >1 doby na budowach, alerty UTP), plan B jest już opisany: GPS LTE-M z [tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md) na 20-50 najdroższych narzędzi, za tę samą warstwę `sygnaly_lokalizacji`.

---

## 10. Czego nie zweryfikowałem

- Cen z Allegro, Amazon.pl, RTV Euro AGD, x-kom i Morele dla tagów Find Hub (blokady/brak wyników); ceny z Ceneo są agregatem i mogą się różnić od cen sklepów. Jedyny wpis Ugreen FineTrack G ma 1 ofertę.
- Certyfikatu Find Hub dla tagów no-name, Fresh 'n Rebel, Logilink; oficjalnej listy Google.
- Czy Workspace jest wspierany przez Find Hub (dokumentacja milczy; jest jedno zgłoszenie awarii).
- Progów czasu UTP i wpływu udostępnienia tagu na alerty.
- Formatu ciała HTTP wysyłanego przez WebUi do Supabase (README opisuje Traccar/PhoneTrack).
- Działania FineTrack G z GoogleFindMyTools (wprost tylko raporty o Ugreen Finder Pro w HA).
- Odporności tagów (IP dla FineTrack G nie podane), zasięgu w metalowej skrzyni, opóźnień w Polsce.
- Limitów Google dla liczby zapytań i liczby tagów na koncie (Google: brak publicznego limitu; Chipolo zaleca max 6 w swojej aplikacji).
- Aktywności `mheers/google-find-my-tools-go` i czy istnieje dojrzała biblioteka Node.

## Źródła

- Repozytoria: leonboe1/GoogleFindMyTools (README, kod, issues #90, #99, #120), BSkando/GoogleFindMy-HA (README, issues #166, #195, #214), P6g9YHK6/GoogleFindMyToolsWebUi, txitxo0/googlefindmytools-homeassistant, luking-dev/findhub-tracker, dylanmazurek/go-findmy, seemoo-lab/Artifacts-for-Okay-Google-Where-is-My-Tracker.
- Google: [Partner Integration Guide](https://developers.google.com/nearby/fast-pair/landing-page-find-hub), [Find Hub Network Accessory Specification](https://developers.google.com/nearby/fast-pair/specifications/extensions/fmdn), [Unknown tracker alerts](https://support.google.com/android/answer/13658562?hl=en), [Share & manage devices](https://support.google.com/android/answer/14800516?hl=en), [Terms of Service](https://policies.google.com/terms?hl=en).
- Tagi i testy: [Gough's Tech Zone: teardown Ugreen FineTrack G](https://goughlui.com/2026/03/15/teardown-ugreen-finetrack-g-item-finder-for-google-find-hub-cm916-65543p/), [9to5Google: Ugreen Slim G](https://9to5google.com/2025/09/15/ugreen-android-find-hub-tracker-ultra-thin/), [Android Authority: test trackerów w Europie](https://www.androidauthority.com/shipped-apple-google-tile-bluetooth-trackers-europe-shocking-results-3647618/), [Android Police: problemy Find Hub](https://www.androidpolice.com/i-want-trust-google-find-hub-but-these-tracking-issues-must-be-fixed/), [rigacci.org](https://www.rigacci.org/wiki/doku.php/doc/appunti/hardware/android_tracking_tag), [Gadget Hacks: zmiany sieci](https://android.gadgethacks.com/news/googles-find-hub-just-gave-you-two-days-to-escape-its-network/), sklep Ugreen EU (Slim G), Ceneo (FineTrack G, Chipolo Pop, Moto Tag), x-kom (FineTrack S).
