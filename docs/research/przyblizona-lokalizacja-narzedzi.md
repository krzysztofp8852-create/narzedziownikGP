# Przybliżona lokalizacja narzędzi: telefony pracowników, bramki strefowe, bramki w pojazdach

Data badania: **2026-09-29**. Ceny sprawdzone tego dnia, w walucie źródła. Przeliczenia na zł są orientacyjne, z tym samym założeniem co
w poprzednim researchu (1 USD ≈ 3,7 zł, kursów dnia nie sprawdzałem).

Ten dokument kontynuuje [nadajniki-ble-nawigacja-do-narzedzi.md](nadajniki-ble-nawigacja-do-narzedzi.md). Nie powtarzam tamtych ustaleń
o tagach (Minew MTB09 3,99 USD, MikroTik TG-BT5-IN 10 USD), protokołach (iBeacon/Eddystone), Web Bluetooth w PWA ani o bateriach.
Oznaczenia są te same: **[Z]** zweryfikowane u źródła, **[W]** tylko z wyników wyszukiwarki, streszczenia strony albo źródła wtórnego,
**[?]** niezweryfikowane.

Pojęcia domenowe wg [CONTEXT.md](../../CONTEXT.md): **Narzędzie**, **Lokalizacja** (baza, budowa, serwis, pojazd), **Ruch**, **Wyszukiwanie**.

---

## 0. Podsumowanie

1. **„Mniej więcej gdzie” da się zrobić z tanim tagiem BLE (< 50 zł).** Nie da się tego zrobić jedną technologią, bo każda
   daje inną ziarnistość:
   - **Pomieszczenie lub strefa w bazie**: stała bramka na strefę (ESP32-C3 za ok. 22–26 zł, Minew MG3 za 19 USD, MikroTik KNOT za 290 zł netto)
     i wybór bramki z najsilniejszym sygnałem. Źródła mówią o dokładności „strefowej”, a nie metrowej. W jednym badaniu z 39 odbiornikami
     BLE na 1600 m² strefa była trafiona w 74–81% przypadków.
   - **Który pojazd**: bramka w busie. Bramka z GNSS i LTE (MikroTik KNOT, KNOT Embedded LTE4, Teltonika FMB/FMC z listą beaconów) podaje
     od razu, gdzie jest bus. Tania bramka LTE bez GNSS (Minew MG8 za 39 USD) mówi tylko, w którym busie jest narzędzie.
   - **Która budowa lub adres**: telefony pracowników z aplikacją natywną, które w tle zgłaszają „widziałem tag X tu i teraz”. Tylko ten
     wariant działa bez żadnej infrastruktury na budowach. Na **Androidzie** jest technicznie wykonalny (foreground service ze stałym
     powiadomieniem albo skan z `PendingIntent`). Na **iOS** jest ograniczony: limit 20 regionów, a region z jednym UUID firmy budzi
     aplikację tylko przy wejściu do niego lub wyjściu, na kilka–30 s. Major i minor da się odczytać tylko przez ranging w tym krótkim oknie.
2. **Wariant z telefonami przetwarza dane lokalizacyjne pracowników.** Taka operacja jest na liście UODO wymagającej oceny skutków (DPIA).
   Trzeba też spełnić wymogi art. 22³ Kodeksu pracy (cel i zakres w regulaminie, informacja 2 tygodnie przed startem).
   Minimalizacja jest możliwa i warto ją zaprojektować od początku: zapisujemy pozycję narzędzia dopasowaną do Lokalizacji, nie trasę
   telefonu. Skanujemy tylko w godzinach pracy i tylko po włączeniu przez pracownika. Nie pokazujemy, czyj to był telefon.
3. **AoA (Bluetooth 5.1) i UWB** dają dokładność od decymetrów do metra, ale nie mieszczą się w założeniach. AoA wymaga własnych tagów
   z CTE i zestawów lokatorów (Minew: ok. 659 USD za zestaw na ok. 400 m² [W]). UWB wymaga tagów, których sam moduł kosztuje
   29,50–49 USD, oraz kotwic.
4. **Sieci zbiorcze bez własnej infrastruktury**: Find My i Find Hub nadal nie mają API. Nodle jest w „closed beta”, Wiliot wymaga własnych
   pikseli i mostków, a Kontakt.io podaje ceny tylko w ofercie. Nie widzę gotowej, legalnej sieci z API i cennikiem dla naszego przypadku.
5. **Rekomendacja**: hybryda w trzech krokach. (1) Bramki strefowe w bazie + bramki w pojazdach. To stała infrastruktura za ok. 2–4 tys. zł
   plus tagi za ok. 3 tys. zł, bez aplikacji natywnej. (2) Aplikacja Capacitor z raportowaniem w tle, najpierw na Androidzie telefonów
   kierowników, z DPIA. (3) Tryb „cieplej/zimniej” z poprzedniego researchu na ostatnie metry. Szczegóły w rozdz. 7 i 8.

---

## 1. Crowdsourcing z telefonów pracowników (wariant najważniejszy)

Idea: aplikacja (Capacitor, natywna) na telefonach pracowników słyszy w tle tagi firmy i wysyła do Supabase krótką obserwację
`(tag, czas, przybliżona pozycja telefonu, dokładność)`. Serwer dopasowuje pozycję do najbliższej znanej **Lokalizacji** (budowa ma adres),
a w przeciwnym razie zapisuje pozycję zgrubnie.

### 1.1 iOS: Core Location (iBeacon) w tle

Ustalenia z dokumentacji Apple:

- **Limit 20 regionów na aplikację.** „Core Location prevents any single app from monitoring more than 20 conditions of any type
  simultaneously” – <https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions> [Z];
  tak samo „An app can register up to 20 regions at a time” – <https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoring(for:)> [Z].
  Limit obejmuje regiony geograficzne i beaconowe łącznie.
- **Jeden UUID firmy wystarcza do wykrycia, ale nie do identyfikacji.** Region może być zdefiniowany samym UUID („Only the UUID is required…
  you can look for related groups of beacons by specifying only a subset of values”). Zdarzenie wejścia przychodzi jednak dla **regionu**,
  a nie dla tagu. Major i minor zwraca dopiero **ranging** (`didRangeBeacons`), który Apple każe uruchamiać po wejściu do regionu:
  <https://developer.apple.com/documentation/corelocation/determining-the-proximity-to-an-ibeacon-device> [Z].
  Wniosek (moja inferencja z mechaniki region enter/exit): telefon, który cały dzień jest „w regionie” (np. w busie pełnym tagów),
  **nie dostaje nowych wybudzeń**, kiedy obok pojawia się kolejny tag z tym samym UUID.
- **Wybudzenie w tle.** „If your app is not running when a beacon is detected, the system tries to launch your app.” Wymaga to autoryzacji
  lokalizacji i trybu tła *Location updates* (ta sama strona [Z]). Po restarcie telefonu monitoring działa dopiero po odblokowaniu (strona o regionach [Z]).
- **Ile czasu po wybudzeniu.** Inżynier DTS Apple (forum, luty 2026): udokumentowane jest tylko to, że system *może* uśpić aplikację zaraz
  po callbacku. W praktyce to „typically with an upper boundary of ~30s”. Zaleca `beginBackgroundTask`:
  <https://developer.apple.com/forums/thread/815618> [W – streszczenie wątku]. W starszym przewodniku Apple jest zalecenie:
  „use beacon ranging only while your app is in the foreground”:
  <https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/RegionMonitoring/RegionMonitoring.html> [Z – archiwum].
- **Dodatkowy wyzwalacz: włączenie ekranu.** `notifyEntryStateOnDisplay = true` powoduje, że system budzi aplikację w tle, gdy użytkownik
  włącza ekran, a telefon jest już w regionie: <https://developer.apple.com/documentation/corelocation/clbeaconregion/notifyentrystateondisplay> [Z].
  Pracownik zerka na telefon kilkadziesiąt razy dziennie, więc każde takie zerknięcie daje ~10–30 s rangingu. Jak często to działa
  w praktyce: [?], do testu.
- **Ciągły ranging w tle („forever ranging”)** jest możliwy, gdy włączymy ciągłe aktualizacje lokalizacji w tle (`allowsBackgroundLocationUpdates`,
  tryb `location`, autoryzacja *Always*). System wtedy nie usypia aplikacji i pokazuje niebieski wskaźnik lokalizacji:
  <https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates> [Z]. Technikę (lokalizacja
  z dokładnością 3 km + background task) i ocenę „może podwoić zużycie baterii” opisuje autor Android Beacon Library:
  <https://davidgyoungtech.com/2023/02/10/forever-ranging> [W – źródło wtórne, autorytatywne].
  Ryzyko przeglądu App Store: wytyczne 2.5.4 („background services only for their intended purposes”) i 5.1.5 (lokalizacja „directly relevant”,
  zgoda przed zbieraniem): <https://developer.apple.com/app-store/review/guidelines/> [Z].
- **Core Bluetooth nie zastąpi Core Location dla iBeacon.** Skanowanie w tle wymaga podania usług (`serviceUUIDs`), a opcja „allow duplicates”
  w tle nie działa: <https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)> [Z].
  iOS maskuje dane ramki iBeacon w Core Bluetooth (wątki forum Apple, np. <https://developer.apple.com/forums/thread/69112>) [W].
  Alternatywa do sprawdzenia: tagi nadające **Eddystone-UID** (usługa 0xFEAA) i skan Core Bluetooth w tle z filtrem na tę usługę. Czy iOS
  w tle dostarcza wtedy `serviceData` i jak często: [?].
- **Jak obejść limit 20 regionów w praktyce**: 1 region = UUID firmy, albo kilka regionów UUID+major (major = np. grupa narzędzi), żeby
  wejście do „nowej grupy” też budziło aplikację. Maksymalnie 20, w tym ewentualne geofence'y budów. To projekt, nie fakt z dokumentacji [?].

**Wniosek dla iOS:** bez ciągłej lokalizacji w tle aplikacja zobaczy tagi „przy okazji” (wejście lub wyjście z regionu, włączenie ekranu)
i przez kilka–30 s. To wystarcza na „widziany dziś rano na budowie X”, ale nie gwarantuje pokrycia. Z ciągłą lokalizacją pokrycie jest pełne,
tylko że wtedy aplikacja w praktyce śledzi pracownika (niebieski wskaźnik, bateria, RODO, przegląd App Store).

### 1.2 Android: skanowanie BLE w tle

- **Uprawnienia**: `BLUETOOTH_SCAN` (Android 12+). Flagi `neverForLocation` **nie możemy** użyć, bo z wyników wyprowadzamy lokalizację.
  Google ostrzega też, że ta flaga może odfiltrować beacony. Potrzebny jest `ACCESS_FINE_LOCATION`, a na Androidzie 10–11 do skanu w tle
  także `ACCESS_BACKGROUND_LOCATION`: <https://developer.android.com/develop/connectivity/bluetooth/bt-permissions> [Z].
- **Skan w tle bez działającego procesu**: `startScan()` z `PendingIntent` i `ScanFilter`. System budzi aplikację dopiero wtedy, gdy pasujące
  urządzenie jest w zasięgu. Google odradza cykliczne skany: <https://developer.android.com/develop/connectivity/bluetooth/ble/background> [Z].
  Filtr można ustawić na `manufacturerData` z prefiksem iBeacon i UUID firmy.
- **Foreground service** ze stałym powiadomieniem. Typy `connectedDevice` (wymaga `BLUETOOTH_SCAN`) albo `location` (wymaga uprawnień
  lokalizacji). Usługi `location` nie da się uruchomić z tła bez `ACCESS_BACKGROUND_LOCATION`. Od Androida 14 typ usługi trzeba zadeklarować
  w Play Console: <https://developer.android.com/develop/background-work/services/fgs/service-types> [Z].
  Android 12+ zabrania startu foreground service z tła poza wyjątkami. Android Beacon Library przechodzi wtedy na JobScheduler
  (co ok. 15 min): <https://altbeacon.github.io/android-beacon-library/foreground-service.html> [W – dokumentacja biblioteki].
  Czy start z `BOOT_COMPLETED` dla typu `location` działa na Androidzie 15/16: [?].
- **Czasy wykrycia** (Android Beacon Library, Android 8+): JobScheduler ok. 7,5 min na wykrycie nowego beacona i do 15 min na zanik.
  Foreground service ok. 1 s i do 30 s. Intent scan: 1 Hz, ale zanik po ok. 15 min:
  <https://altbeacon.github.io/android-beacon-library/detection_times.html> [W].
- **Dławienie skanów**: najwyżej 5 startów skanu na 30 s. Skany bez filtra są zatrzymywane przy wyłączonym ekranie. Znam to tylko ze źródeł
  wtórnych (Punch Through i inne), kodu AOSP nie udało się pobrać (gitiles 503): <https://punchthrough.com/android-ble-scan-errors/> [W].
- **Pozycja telefonu w tle**: od Androida 8 aplikacje w tle dostają aktualizacje lokalizacji „only a few times per hour”. Foreground service
  liczy się jako dostęp „na pierwszym planie”: <https://developer.android.com/develop/sensors-and-location/location/background> [Z].
  Nam wystarcza ostatnia znana pozycja z dokładnością ~100 m.
- **Google Play i lokalizacja w tle**: formularz deklaracji, film ≤ 30 s, wyraźna informacja w aplikacji przed prośbą o uprawnienie, polityka
  prywatności. Lokalizacja w tle tylko wtedy, gdy jest „relevant to the core functionality”. Foreground service musi być „continuation of an
  in-app, user-initiated action”. Polityka nie opisuje wprost aplikacji firmowych ani śledzenia mienia:
  <https://support.google.com/googleplay/android-developer/answer/9799150> [W – streszczenie strony]. Alternatywa: dystrybucja prywatna
  (Managed Google Play) poza publicznym sklepem – [?], nie badałem.
- **Producenci telefonów** (Xiaomi, Samsung, Huawei) dodatkowo zabijają usługi w tle. To wiedza powszechna, nie zweryfikowałem jej [?]. Wymaga testu na telefonach załogi.

### 1.3 Wtyczki Capacitor

| Wtyczka | Licencja | Stan | iOS | Android | Tło |
|---|---|---|---|---|---|
| `@capgo/capacitor-ibeacon` | MPL-2.0 | aktywna, push 2026-09-24, wersja 8 = Capacitor 8 [Z] | Core Location | AltBeacon Android Beacon Library 2.21.2 | iOS: *Always* + Background Modes; Android 8+: foreground service przełączany automatycznie [Z – README] |
| `capacitor-ibeacon` (RangerRick) | MIT | **zarchiwizowana 2024-04-18** [Z] | tak | „TODO” | – |
| `@capacitor-community/bluetooth-le` | MIT | por. poprzedni research | Core Bluetooth (bez iBeacon) | skan | brak opisu tła [Z] |

Źródła: <https://github.com/Cap-go/capacitor-ibeacon>, <https://github.com/RangerRick/capacitor-ibeacon>. Najlepszy kandydat to Capgo
na iOS, ale zachowania w tle na iOS trzeba sprawdzić własnym prototypem (rozdz. 1.1). Czy wtyczka wspiera `notifyEntryStateOnDisplay`
i `PendingIntent`: [?].

### 1.4 Bateria telefonu

- Apple: monitoring regionów to „passive listening… consumes far less power”, a ranging to „frequent measurements” (strona o iBeacon [Z]).
- Android Beacon Library: 90 mA przy skanowaniu na pierwszym planie, 37 mA z domyślnym trybem oszczędzania w tle (skan 10 s co 5 min).
  Pomiar na Nexusie 4, autor sam pisze, że liczby są nieaktualne: <https://altbeacon.github.io/android-beacon-library/battery_manager.html> [W].
- Wniosek: skany cykliczne (np. 10 s co 2–5 min) albo wyzwalane systemem (PendingIntent, wejście do regionu) są akceptowalne.
  Ciągły skan z ciągłą lokalizacją to realny koszt baterii. Na naszych telefonach go nie mierzyłem [?].

### 1.5 RODO i prawo pracy

- **Obserwacja „telefon Jana widział tag X w punkcie P o godzinie T” to dane o lokalizacji pracownika**, nawet jeśli zapisujemy ją jako pozycję
  narzędzia. Na wykazie UODO operacji wymagających DPIA (M.P. 2019 poz. 666), pkt 12 „Przetwarzanie danych lokalizacyjnych”, wymieniono
  wprost „Przetwarzanie danych lokalizacyjnych pracowników”. Ten sam wykaz obejmuje też systematyczne monitorowanie w zakładach pracy:
  <https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WMP20190000666> [Z – tekst PDF].
- **Kodeks pracy art. 22³ § 4**: przepisy o monitoringu stosuje się odpowiednio do „innych form monitoringu”, jeśli są konieczne do zapewnienia
  organizacji pracy i „właściwego użytkowania udostępnionych pracownikowi narzędzi pracy”. Z art. 22² § 6–8 wynika, że cel, zakres i sposób
  ustala się w regulaminie pracy (albo w układzie zbiorowym lub obwieszczeniu). Pracowników informuje się **najpóźniej 2 tygodnie przed
  uruchomieniem**, a nowemu pracownikowi przekazuje się te informacje przed dopuszczeniem do pracy. Tekst jednolity z ISAP, stan z 2026-08-18:
  <https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU19740240141/U/D19740141Lj.pdf> [Z]. Czy nasz przypadek to „monitoring pracownika”,
  czy tylko „ewidencja narzędzi”, musi ocenić prawnik [?]. Ostrożnie zakładam, że to monitoring.
- **WP29 Opinia 2/2017 (WP249)**, najważniejsze fragmenty
  (<https://ec.europa.eu/newsroom/article29/redirection/document/45631> [Z]):
  - przykładem niedozwolonego dalszego przetwarzania jest użycie danych z geolokalizacji (np. „WiFi- or Bluetooth tracking”) „to constantly
    check an employee's movements and behaviour”;
  - przy MDM: „Tracking systems can be designed to register the location data without presenting it to the employer” (dane pokazywane
    tylko w uzasadnionej sytuacji);
  - przy pojazdach: brak podstawy do śledzenia poza godzinami pracy, możliwość czasowego wyłączenia oraz cytat „Vehicle tracking devices
    are not staff tracking devices”.
- **Minimalizacja, którą proponuję wbudować** (projekt, nie wymóg z jednego przepisu):
  1. Aplikacja **nie wysyła trasy**, tylko zdarzenie „tag X widziany”. Pozycję od razu dopasowuje do **Lokalizacji** firmy (geofence
     budowy lub bazy). Gdy dopasowania brak, zaokrągla ją do np. ~500 m albo do nazwy miejscowości.
  2. **Brak identyfikatora telefonu i osoby** w zapisie pozycji narzędzia albo osobna tabela z krótkim TTL (np. 7 dni), widoczna tylko
     dla Właściciela.
  3. **Tylko ostatnia obserwacja na tag** (upsert), bez historii, albo historia tylko zmian Lokalizacji.
  4. **Skan tylko w godzinach pracy**, włącznik w aplikacji, możliwość wyłączenia (jak opt-out z WP249).
  5. **Preferowane telefony służbowe**. Przy prywatnych telefonach (BYOD) dochodzą dodatkowe ryzyka z WP249 [?].
  6. Region przetwarzania: nasza baza jest w UE (ADR [0001](../adr/0001-supabase-w-irlandii.md)).
- Formalności: DPIA, klauzula informacyjna (art. 13 RODO), zapis w regulaminie pracy każdej Firmy-klienta. Firma jest administratorem,
  a my podmiotem przetwarzającym, więc potrzebna jest umowa powierzenia [?]. Wymaga porady prawnej.

### 1.6 Dokładność i świeżość

- Adres lub budowa: dokładność pozycji telefonu (GPS/Wi-Fi/sieć) plus zasięg tagu (do kilkudziesięciu metrów, por. poprzedni research).
  To wystarcza do rozróżnienia budów oddalonych o setki metrów. Nie wystarcza do rozróżnienia sąsiednich działek [?].
- Świeżość zależy od tego, czy ktoś z aplikacją był w pobliżu. Na aktywnej budowie z brygadą to kilka razy dziennie, a w piwnicy
  zamkniętej budowy nigdy.
- Pojazd: telefon nie odróżni „narzędzie w busie” od „narzędzie obok busa”. Heurystyka „tag porusza się razem z telefonem z prędkością
  > 20 km/h” jest możliwa, ale niesprawdzona [?].

---

## 2. Strefy z wieloma bramkami (poziom pomieszczenia)

### 2.1 Jak to działa i jaka dokładność

- Metoda najprostsza: bramka na strefę, a tag przypisujemy do bramki z najsilniejszym (wygładzonym) RSSI, z histerezą. Fingerprinting
  (mapa RSSI wszystkich bramek → strefa) jest dokładniejszy, ale wymaga kalibracji w każdej bazie.
- Cisco: BLE daje dokładność „na poziomie strefy”, a ściany i metal tłumią sygnał (poprzedni research, <https://spaces.cisco.com/ble-tags/>) [Z].
- **Badanie (ośrodek opieki, 1600+ m², 39 odbiorników BLE)**: strefa trafiona średnio w **73,8%** przypadków przy zwykłej trilateracji
  i w **81,4%** przy trilateracji adaptacyjnej. W zależności od strefy wynik wynosił 50–100%. Po fuzji z IMU telefonu było to 87,1%,
  a błąd pozycji 3,9–4,2 m: Tabela 1 w <https://arxiv.org/abs/2305.19342> [Z – PDF]. To inne środowisko (ludzie, nie narzędzia
  na metalowych regałach). Dla nas będzie to wymagało testu [?].
- Wniosek: przy 6 strefach realny cel to „w której strefie” z wyraźnymi granicami (osobne pomieszczenia, kontener, wiata). Strefy
  „regał A vs regał B” w jednej hali będą się mylić, chyba że bramki stoją przy regałach i mają obniżoną moc lub filtr RSSI [?].

### 2.2 Sprzęt (ceny z 2026-09-29)

| Bramka | Łączność | Cena | Uwagi |
|---|---|---|---|
| **ESP32-C3** (Waveshare ESP32-C3-Zero / Seeed XIAO C3) | Wi-Fi, BLE 5 | **21,90 zł / 25,90 zł** (Botland) [W – lista wyników] | + zasilacz USB i obudowa [?]; ESPresense ma gotowy firmware dla C3 [Z] |
| **Minew MG3** | Wi-Fi, BLE 5.0, ESP32 | **19,00 USD** (minewstore) [Z] | HTTP(S)/MQTT, filtry RSSI/MAC (poprzedni research); −20…55 °C [Z] |
| **Minew MG11** | Wi-Fi (dual band), nRF54L15 | **25,00 USD** [Z] | ok. 270 pakietów/s [Z] |
| **MikroTik KNOT** (RB924i-2nD-BT5&BG77) | BT 5.2, 2× Ethernet, Wi-Fi, LTE Cat-M/NB-IoT, GNSS | **290,30 zł netto / 357,07 zł brutto** (WISP.PL, dostępny) [Z]; MSRP 99 USD [Z] | skaner BLE w RouterOS (`/iot bluetooth scanners advertisements`, lista do 1024 wpisów), wysyłka MQTT/HTTPS skryptem [W – dokumentacja MikroTik, streszczenie] |

Źródła: <https://www.minewstore.com/product/mg3-mini-usb-gateway>, <https://www.minewstore.com/>, <https://mikrotik.com/product/knot>,
<https://www.wisp.pl/p8315,mikrotik-knot-rb924i-2nd-bt5-bg77.html>, <https://botland.com.pl/szukaj?controller=search&s=esp32-c3>,
<https://help.mikrotik.com/docs/spaces/ROS/pages/78086201/Bluetooth>.

### 2.3 Gotowe systemy open source

| System | Jak działa | Stan (GitHub API, 2026-09-29) | Czy jako nasz backend |
|---|---|---|---|
| **ESPresense** | Firmware na ESP32/C3/S3. Każdy węzeł = pokój, liczy odległość z RSSI (filtr medianowy + 1€), publikuje MQTT na `espresense/devices/<id>/<pokój>` z polami `id`, `rssi`, `distance`. iBeacon ma ID `iBeacon:<uuid>-<major>-<minor>` [Z – kod `main/main.cpp`, `main/BleFingerprint.cpp`]. Tryb pokojowy (`mqtt_room`) albo companion z X,Y przy 5–8+ węzłach [W – espresense.com] | **AGPL-3.0**, v4.0.6 (2026-02-28), aktywny [Z] | Tak, jako **firmware węzłów**. Wymaga brokera MQTT i mostu MQTT → Supabase (nie ma ich w naszym stosie). Przy AGPL i dystrybucji zmodyfikowanego firmware klientom trzeba udostępnić źródła [?] |
| **ESPresense-companion** | Serwis liczący pozycję X,Y z wielu węzłów | Apache-2.0, aktywny [Z] | Tylko przy mapie hali; dla nas za dużo |
| **Home Assistant Bermuda** | Integracja HA. Obszar = najbliższy proxy (ESPHome `bluetooth_proxy`, Shelly), obsługuje iBeacon, MIT [W – README] | v0.8.7 (2026-07-11) [Z] | **Nie** – wymaga Home Assistant jako środowiska uruchomieniowego |
| **room-assistant** | Node.js na Raspberry Pi, klaster, MQTT/HA, MIT | ostatnie wydanie **v2.20.0 z 2022-03-20** [Z] | Nie – bez wydań od 4 lat |
| **OpenMQTTGateway** | ESP32 → MQTT (BLE i inne) | GPL-3.0, v1.8.1 (2025-01-13) [Z] | Możliwy zamiennik ESPresense |

### 2.4 Integracja z Supabase

- Najprostsza ścieżka bez brokera: bramka Minew (HTTP POST JSON, co 1–300 s, Basic auth, por. poprzedni research) → Supabase Edge Function
  z `verify_jwt = false` w `supabase/config.toml` i własnym sekretem. Dokumentacja podaje to jako wzorzec dla webhooków (Stripe) i ostrzega,
  że „it will allow anyone to invoke your Edge Function”: <https://supabase.com/docs/guides/functions/function-configuration> [Z].
- ESPresense i MikroTik (MQTT): potrzebny broker (Mosquitto na małym serwerze albo broker w chmurze) i subskrybent zapisujący do Postgresa [?].
- Wolumen: 6 bramek wysyłających paczkę co 60 s daje ok. 8,6 tys. wywołań na dobę (ok. 260 tys. miesięcznie). Limity wywołań Edge Functions
  w planie Supabase nie były widoczne na stronie cennika w chwili sprawdzenia [?]. Zapisywać tylko zmianę strefy i „ostatnio widziany” (upsert), nie każdy pakiet.

---

## 3. Bramki w pojazdach

Pojazd to **Lokalizacja** ruchoma. Bramka w busie odpowiada na dwa pytania: „w którym busie jest narzędzie” (zawsze) i „gdzie jest bus”
(tylko z GNSS).

| Bramka | GNSS | Sieć | Zasilanie | Cena | Integracja |
|---|---|---|---|---|---|
| **MikroTik KNOT** | tak (SMA) [Z] | LTE Cat-M/NB-IoT (BG77) | DC 12–57 V, PoE, microUSB 5 V; maks. 18 W [Z] | 290,30 zł netto [Z] | RouterOS: skrypt czyta ogłoszenia BLE i publikuje MQTT. **BG77 nie potrafi jednocześnie utrzymać połączenia Cat-M i pobierać GPS**: skrypt wyłącza PPP na ok. 32 s, żeby złapać pozycję: <https://help.mikrotik.com/docs/spaces/ROS/pages/176914435/Bluetooth+tag-tracking+using+MQTT+and+ThingsBoard> [W – streszczenie] |
| **MikroTik KNOT Embedded LTE4** | tak (SMA) [Z] | LTE Cat 4 | PoE 12–57 V, USB-C 5 V; maks. 7 W; −40…70 °C; IP20, DIN [Z] | MSRP **79 USD** (Global 89 USD) [Z]; cena w PL [?] | BT 5.4 [Z]; wymaga obudowy i przetwornicy lub zasilania PoE w aucie [?] |
| **Teltonika FMB/FMC** (np. FMC150, FMC920, FMC003) | tak | LTE Cat 1 / 2G | instalacja samochodowa | FMC920: **181,47 zł netto** (Batna24, brak w magazynie) [Z]; FMC920 i FMC003 mają na stronie producenta status **End of life** [Z] | „Beacon List”: do 100 beaconów, iBeacon (UUID+major+minor) i Eddystone, tryby All/Configured, wysyłka „On Change” lub okresowo (domyślnie 60 s): <https://wiki.teltonika-gps.com/view/FMC150_Beacon_List> [Z]. Protokół **Codec 8/8E po TCP/UDP**, bez HTTP i MQTT: <https://wiki.teltonika-gps.com/view/Codec> [Z]. Potrzebny serwer pośredni, np. **Traccar** (Apache-2.0), który dekoduje beacony (`beacon1Uuid/Major/Minor/Rssi`, kod `TeltonikaProtocolDecoder.java` [Z]) i przekazuje pozycje dalej (`forward.type` = json/mqtt/…: <https://www.traccar.org/forward/> [Z]) |
| **Teltonika FTC921** (następca w linii FT) | tak | LTE Cat 1 | 10–90 V [Z] | **191,21 zł netto** (WISP.PL, dostępny) [Z] | Obsługi listy beaconów BLE nie potwierdziłem [?] |
| **Minew MG8** | **nie** [Z] | LTE Cat 1, nano SIM | USB 5 V/2 A; −20…60 °C [Z] | **39 USD** [Z] | TLS, TagCloud; pamięć offline ok. 30 tys. rekordów [Z]. Mówi „w busie X”, ale nie gdzie jest bus |

- Karty SIM M2M dla 8 pojazdów: abonamentów nie sprawdzałem [?].
- Jeśli firma ma już GPS flotowy, można użyć taniej bramki bez GNSS (MG8) i pozycji busa z systemu flotowego. API zależy od dostawcy [?].
- Temperatura: MG8 i MG3 do 55–60 °C [Z]. W nagrzanym aucie latem może być więcej (inferencja).
- RODO: bramka w pojeździe to też lokalizacja kierowcy (WP249, rozdz. 1.5). Zasady są te same: godziny pracy i brak oceny kierowcy.

---

## 4. Dokładniejsze technologie (dla porównania)

| Technologia | Dokładność | Tag | Infrastruktura | W budżecie? |
|---|---|---|---|---|
| **BLE AoA/AoD** (Bluetooth 5.1, CTE) | Bluetooth SIG: „centimeter-level” [Z]; Minew AoA G2: „sub-meter class” [Z], 0,5–1 m średnio i 10–50 cm przy wielu lokatorach [W] | Tag musi nadawać CTE. MTB09 (BT 5.0) się nie nadaje. Minew MWL01 (IP65) [Z], cena [?] | Minew: G2 + 4 lokatory AR1 na ok. 400 m², montaż 3–6 m, zestaw **ok. 659 USD** [W – Alibaba]. u-blox XPLR-AOA-3 to zestaw deweloperski (ANT-B10 + C209), ceny nie potwierdziłem [?]. Quuppa: od 10 cm, cena tylko w ofercie [W]. Kompromis dokładność–opóźnienie–liczba tagów: 1 lokator ok. 1000 pakietów/s, więc np. 25 tagów przy 100 ms i 4 lokatorach [W – BeaconZone] | Tag prawdopodobnie tak, **infrastruktura drogo i tylko w bazie**. Przy 200 tagach trzeba wydłużyć interwał, co zwiększa opóźnienie |
| **UWB** (Qorvo DW3000, Apple U1/U2) | Pozyx: 10–30 cm [W] | Sam moduł Qorvo DWM3001C ok. **49,47 USD**, zestaw DWM3001CDK **29,50 USD** (DigiKey) [Z/W]. Tag z baterią i obudową na pewno > 50 zł | Kotwice. Ceny Pozyx/Sewio tylko w ofercie [?]. iPhone (Nearby Interaction) mierzy odległość i kierunek do akcesorium, ale wymaga połączenia BLE z każdym akcesorium. W tle działa tylko z urządzeniami sparowanymi i połączonymi, a od iOS 18.4 także z Live Activity: <https://developer.apple.com/documentation/nearbyinteraction> [Z] | **Nie** (koszt tagu). Ewentualnie na pojedyncze drogie urządzenia (niwelator, dalmierz) |
| **Bluetooth Channel Sounding** (BT 6.0) | [?] | tanich tagów nie znalazłem [?] | wsparcie w telefonach [?] | Do obserwacji |

Źródła: <https://www.bluetooth.com/learn-about-bluetooth/feature-enhancements/direction-finding/>,
<https://www.minew.com/product/bluetooth-5-1-aoa-indoor-positioning/>, <https://www.beaconzone.co.uk/blog/bluetooth-aoa-direction-finding-tradeoffs/>,
<https://www.u-blox.com/en/product/xplr-aoa-3-kit>, <https://www.digikey.com/en/products/detail/qorvo/DWM3001CDK/24367348>, <https://www.pozyx.io/products/pozyx-uwb-rtls>.

---

## 5. Sieci zbiorcze bez naszej infrastruktury

- **Google Find Hub**: w przewodniku integracji partnera jest zdanie „Google does not provide a specific SDK or API for this integration”
  (chodzi o firmware akcesorium). API do odczytu lokalizacji własnych tagów przez firmę nie ma:
  <https://developers.google.com/nearby/fast-pair/landing-page-find-hub> [Z]. Stan się nie zmienił od poprzedniego researchu.
- **Apple Find My**: nadal MFi i brak API (poprzedni research). Od iOS 18.2 istnieje **„Share Item Location”**, czyli tymczasowy link
  ważny 7 dni, dla znajomych lub linii lotniczych: <https://support.apple.com/en-us/121488> [W]. To funkcja ręczna, a nie API.
- **Amazon Sidewalk**: dostępny w USA (wg części źródeł także w Kanadzie i Meksyku), w UE dopiero „planowany” [W]:
  <https://www.semtech.com/amazon-sidewalk-faqs>. Odpada.
- **Nodle**: sieć smartfonów z SDK, które czytają tagi BLE. Usługa śledzenia mienia jest w „closed beta”, cennika i dokumentacji API nie ma
  w dokumentacji: <https://docs.nodle.com/nodle-iot> [W]. Model oparty na tokenie NODL (Web3) [W]. Do tego RODO: nasze narzędzia byłyby
  widziane przez telefony obcych ludzi, a dane przetwarzałby zewnętrzny podmiot [?].
- **Wiliot**: bezbateryjne „IoT Pixels”, ok. 10 centów w Gen3 [W]. Wymagają mostków lub bramek Wiliot (telefon też może być bramką)
  i chmury Wiliot. Starter kit 500 USD z 6 miesiącami chmury, dalszej ceny chmury nie ujawniono [W]:
  <https://www.hackster.io/news/wiliot-launches-its-iot-pixels-starter-kit-aims-to-kickstart-the-internet-of-everyday-things-d17a1b675932>.
  To nie jest sieć zbiorcza „bez infrastruktury”, tylko własna infrastruktura z inną technologią tagów.
- **Kontakt.io**: SDK łączności i bramek (referencyjne dla ESP32 i Raspberry Pi), chmura Kio. Cena tylko w ofercie:
  <https://kontakt.io/kiocloud-connectivity-and-firmware-sdk/> [Z]. Portal Beam z Kio Cloud za 139/199 USD rocznie wg agregatora [W].
  Mobilnego SDK zamieniającego telefon w bramkę na tej stronie nie ma [Z – brak].
- **Wniosek**: nie znalazłem legalnej sieci zbiorczej z publicznym API i cennikiem, działającej w Polsce z tanim tagiem.
  „Własna sieć zbiorcza” to w praktyce wariant z rozdz. 1 (telefony naszych pracowników).

---

## 6. Tabela porównawcza

Scenariusz: **200 narzędzi, 1 baza z 6 strefami, 8 pojazdów**. Tagi: 200 × MTB09 ≈ **3 000 zł** (3,99 USD) albo 200 × MikroTik TG-BT5-IN
≈ 7 400 zł (MSRP 10 USD) lub 10 600 zł (Allegro). Bez VAT, wysyłki, montażu i pracy programistów.

| Wariant | Adres/budowa | Pojazd | Pomieszczenie | Metr | Sprzęt poza tagami | Koszty stałe | Wymaga | Główne ryzyka |
|---|---|---|---|---|---|---|---|---|
| **A. Telefony pracowników** | **tak**, gdy ktoś był w pobliżu | słabo (heurystyka) [?] | nie | nie | 0 zł | Apple 99 USD/rok [Z] (<https://developer.apple.com/programs/whats-included/>), Google Play 25 USD jednorazowo [Z] (<https://support.google.com/googleplay/android-developer/answer/6112435>) | aplikacja natywna (Capacitor) na iOS i Android | iOS w tle ograniczony; bateria; **RODO/DPIA, art. 22³ k.p.**; przegląd sklepów (lokalizacja w tle); zabijanie usług przez producentów |
| **B. Bramki strefowe w bazie** | tylko „w bazie” | nie | **tak** (strefa) | nie | 6 × ESP32-C3 ≈ 130–160 zł + zasilacze [?]; 6 × MG3 = 114 USD (≈ 420 zł); 6 × KNOT ≈ 1 742 zł netto | Wi-Fi w bazie; broker MQTT przy ESPresense [?] | Edge Function (HTTP) albo broker MQTT | metal regałów; kalibracja RSSI; pomyłki stref w jednej hali |
| **C. Bramki w pojazdach** | **tak** (pozycja busa, jeśli GNSS) | **tak** | nie | nie | 8 × KNOT ≈ 2 322 zł netto; 8 × Teltonika ≈ 1 450–1 530 zł netto (EOL / beacony [?]); 8 × MG8 = 312 USD (≈ 1 150 zł, bez GNSS) | 8 × SIM [?]; przy Teltonice serwer Traccar [?] | montaż w aucie, zasilanie 12 V | temperatura; KNOT: GPS i LTE naprzemiennie; Teltonika: Codec 8 zamiast HTTP |
| **D. BLE AoA** | nie | nie | tak | **~0,5–1 m** | ok. 659 USD na ~400 m² [W] + tagi CTE [?] | – | montaż sufitowy, własne tagi producenta | zamknięty ekosystem; limit liczby tagów vs opóźnienie |
| **E. UWB** | nie | nie | tak | **10–30 cm** | tag > 50 zł; kotwice [?] | – | – | poza budżetem tagu |
| **F. Find My / Find Hub / Nodle / Wiliot / Kontakt.io** | Find My/Hub: tak, ale bez API | – | – | – | – | wycena indywidualna | – | brak API; zależność od dostawcy; RODO przy obcych telefonach |

Przykładowy komplet **B + C** (ESP32-C3 w bazie, KNOT w busach): tagi ok. 3 000 zł + ok. 200–400 zł (bramki bazy z zasilaczami) + ok. 2 300 zł
netto (8 × KNOT) ≈ **5,5–6 tys. zł** plus SIM-y. Wariant z MG8 zamiast KNOT: ok. **4,5 tys. zł**, ale bez pozycji busów.
**A** dokłada 0 zł sprzętu, za to dochodzi koszt aplikacji natywnej i formalności RODO.

---

## 7. Rekomendacja dla NarzędziownikaGP

1. **Krok 1 – infrastruktura bez aplikacji natywnej (B + C).** Zostajemy przy PWA. Bramki w 6 strefach bazy (pilot: 2 × ESP32-C3 z ESPresense
   albo 2 × Minew MG3) i w 2 busach (1 × KNOT, 1 × MG8 dla porównania). Wszystko przez jedną Edge Function do tabeli „ostatnio słyszany”
   (tag, Lokalizacja, strefa, czas, źródło). Nie powstaje żaden **Ruch**, bo historia Ruchów tylko się dopisuje i zostaje ręczna (CONTEXT.md).
   Zysk: „Magazyn, strefa B” i „w busie X” dla większości sprzętu. RODO jest prostsze (bramka stała, bez telefonów). Przy pojazdach
   i tak trzeba poinformować załogę i ustalić godziny.
2. **Krok 2 – telefony (A) jako dodatek dla budów.** Aplikacja Capacitor z `@capgo/capacitor-ibeacon`. Najpierw **Android na telefonach
   służbowych kierowników** (skan z PendingIntent albo foreground service w godzinach pracy). iOS dopiero po prototypie sprawdzającym,
   ile obserwacji dają wejścia do regionu i `notifyEntryStateOnDisplay` bez ciągłej lokalizacji. Przed startem: DPIA, zapis w regulaminie
   pracy, informacja 2 tygodnie przed uruchomieniem, projekt z minimalizacją z rozdz. 1.5.
3. **Krok 3 – ostatnie metry.** Tryb „cieplej/zimniej” z poprzedniego researchu (wariant A tamtego dokumentu) w tej samej aplikacji.
4. **Alternatywa dla budów bez aplikacji**: jedna bramka LTE (MG8, 39 USD + SIM) w kontenerze każdej aktywnej budowy. Wtedy „na budowie X”
   wynika z przypisania bramki do Lokalizacji, bez lokalizacji pracowników. Koszt rośnie z liczbą budów.
5. **Nie rekomenduję**: AoA i UWB (koszt, zamknięte ekosystemy), sieci typu Nodle i Wiliot (brak API i cennika, RODO), ciągłego śledzenia
   w tle na iOS jako domyślnego trybu (RODO i przegląd App Store).
6. **Potrzebna decyzja (ADR)**: czy obserwacje z tagów są osobnym pojęciem domenowym, np. „sygnał” albo „ostatnio widziany” (propozycja
   nazwy, nie termin z CONTEXT.md). Czy rozbieżność „ewidencja: Baza, sygnał: Budowa X” ma tworzyć podpowiedź dla Kierownika, podobną
   do **Propozycji ruchu**. Czy PWA przestaje być jedynym klientem (ADR [0010](../adr/0010-pwa-kopia-tablicy-w-service-workerze.md)).

---

## 8. Co pokazać użytkownikowi (Wyszukiwanie i karta Narzędzia)

Zasada: **ewidencja (Ruch) i sygnał to osobne linie**, a przy sygnale zawsze podajemy źródło i wiek.

| Źródło | Przykład | Uwagi |
|---|---|---|
| Bramka strefowa | **Baza · strefa „Regały B”** · 4 min temu | „pewne”, gdy < 15 min; strefa to nazwa nadana przez Magazyniera |
| Bramka w pojeździe z GNSS | **Bus WX 1234** · teraz w okolicy ul. Kwiatowej, Łódź · 12 min temu | adres z odwrotnego geokodowania pozycji busa [?] |
| Bramka w pojeździe bez GNSS | **Bus WX 1234** · 12 min temu | bez adresu |
| Telefon, dopasowany do budowy | **Prawdopodobnie: Budowa ul. Leśna 5** · widziany 2 h temu przez telefon pracownika | **bez nazwiska** (minimalizacja). Przykład „przez telefon Jana” wskazuje, gdzie był Jan, więc najwyżej dla Właściciela i tylko po decyzji w DPIA |
| Telefon, bez dopasowania | **Okolice: Zgierz** · wczoraj 14:10 | zaokrąglone, bez punktu na mapie |
| Rozbieżność | „Ewidencja: Baza (od 3 dni). **Sygnał: Budowa ul. Leśna 5**, 2 h temu” + przycisk „Zarejestruj ruch” dla ról z prawem do Ruchów | nie zmienia ewidencji automatycznie |
| Brak sygnału | „Nie słyszany od 9 dni” (szare) | może oznaczać rozładowany tag, a nie zaginięcie |

Przy każdym wpisie warto pokazać ikonę źródła (bramka / bus / telefon) i odcień „świeżości”. Po np. 24 h sygnał przechodzi w szary,
żeby „2 dni temu na budowie” nie wyglądało jak fakt.

---

## 9. Pytania otwarte i testy do zrobienia

- iOS: ile obserwacji dziennie dają wybudzenia po wejściu do regionu i po włączeniu ekranu (prototyp na 2–3 iPhone'ach, 1 tydzień) [?].
- iOS: czy Eddystone-UID przez Core Bluetooth w tle zwraca `serviceData` [?].
- Android: skan z PendingIntent i filtrem iBeacon na telefonach załogi (Samsung, Xiaomi) z wyłączonym ekranem [?]; start usługi po restarcie telefonu [?].
- Bramki: trafność stref przy metalowych regałach; czy wystarczy 6 × ESP32-C3 z filtrem RSSI [?].
- Pojazdy: zasilanie KNOT z instalacji 12 V (dolna granica 12 V), temperatura w kabinie, koszt SIM [?]; aktualny model Teltoniki z listą beaconów [?].
- Supabase: limity wywołań Edge Functions i koszt brokera MQTT [?].
- Prawne: kwalifikacja z art. 22³ k.p., DPIA, umowa powierzenia z Firmami, BYOD [?].

---

## 10. Źródła (poza poprzednim researchem)

- Apple Core Location: <https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions>,
  <https://developer.apple.com/documentation/corelocation/determining-the-proximity-to-an-ibeacon-device>,
  <https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoring(for:)>,
  <https://developer.apple.com/documentation/corelocation/clbeaconregion/notifyentrystateondisplay>,
  <https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates>,
  <https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background>,
  archiwum: <https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/RegionMonitoring/RegionMonitoring.html>
- Apple Core Bluetooth: <https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)>
- Apple forum DTS: <https://developer.apple.com/forums/thread/815618>; App Review: <https://developer.apple.com/app-store/review/guidelines/>;
  Nearby Interaction: <https://developer.apple.com/documentation/nearbyinteraction>; Program: <https://developer.apple.com/programs/whats-included/>
- Android: <https://developer.android.com/develop/connectivity/bluetooth/bt-permissions>, <https://developer.android.com/develop/connectivity/bluetooth/ble/background>,
  <https://developer.android.com/develop/background-work/services/fgs/service-types>, <https://developer.android.com/develop/sensors-and-location/location/background>,
  <https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices>
- Google Play: <https://support.google.com/googleplay/android-developer/answer/9799150>, <https://support.google.com/googleplay/android-developer/answer/6112435>
- Android Beacon Library: <https://altbeacon.github.io/android-beacon-library/detection_times.html>, <https://altbeacon.github.io/android-beacon-library/battery_manager.html>,
  <https://altbeacon.github.io/android-beacon-library/foreground-service.html>; David Young: <https://davidgyoungtech.com/2023/02/10/forever-ranging>
- Capacitor: <https://github.com/Cap-go/capacitor-ibeacon>, <https://github.com/RangerRick/capacitor-ibeacon>
- Prawo: Kodeks pracy (ISAP, t.j.): <https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU19740240141/U/D19740141Lj.pdf>;
  wykaz UODO (M.P. 2019 poz. 666): <https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WMP20190000666>;
  WP29 WP249: <https://ec.europa.eu/newsroom/article29/redirection/document/45631>
- Systemy strefowe: <https://github.com/ESPresense/ESPresense>, <https://espresense.com/>, <https://github.com/ESPresense/ESPresense-companion>,
  <https://github.com/agittins/bermuda>, <https://github.com/mKeRix/room-assistant>, <https://github.com/1technophile/OpenMQTTGateway>
- Badanie strefowe: <https://arxiv.org/abs/2305.19342>; przegląd: <https://arxiv.org/abs/2404.12529>
- MikroTik: <https://mikrotik.com/product/knot>, <https://mikrotik.com/product/knot_embedded_lte4>,
  tag zewnętrzny TG-BT5-OUT (550 mAh, ok. 5 lat przy 1 s, IP69K, −20…85 °C, 18 USD – ponad limit tagu) <https://mikrotik.com/product/tg_bt5_out> [Z],
  <https://help.mikrotik.com/docs/spaces/ROS/pages/78086201/Bluetooth>,
  <https://help.mikrotik.com/docs/spaces/ROS/pages/176914435/Bluetooth+tag-tracking+using+MQTT+and+ThingsBoard>; WISP.PL: <https://www.wisp.pl/p8315,mikrotik-knot-rb924i-2nd-bt5-bg77.html>
- Minew: <https://www.minewstore.com/product/mg3-mini-usb-gateway>, <https://www.minew.com/product/mg8-micro-usb-lte-gateway/>,
  <https://www.minew.com/product/bluetooth-5-1-aoa-indoor-positioning/>
- Teltonika: <https://wiki.teltonika-gps.com/view/FMC150_Beacon_List>, <https://wiki.teltonika-gps.com/view/Codec>,
  <https://www.teltonika-gps.com/products/trackers/basic/fmc920>, <https://www.batna24.com/pl/p/trackery-gps/teltonika-fmc920-lokalizator-gps-lte-cat-1-gsm-gprs-gnss-bt>,
  <https://www.wisp.pl/p10532,teltonika-ftc921.html>; Traccar: <https://github.com/traccar/traccar>, <https://www.traccar.org/forward/>
- Supabase: <https://supabase.com/docs/guides/functions/function-configuration>
- AoA/UWB: <https://www.bluetooth.com/learn-about-bluetooth/feature-enhancements/direction-finding/>, <https://www.beaconzone.co.uk/blog/bluetooth-aoa-direction-finding-tradeoffs/>,
  <https://www.u-blox.com/en/product/xplr-aoa-3-kit>, <https://www.digikey.com/en/products/detail/qorvo/DWM3001CDK/24367348>, <https://www.pozyx.io/products/pozyx-uwb-rtls>
- Sieci zbiorcze: <https://developers.google.com/nearby/fast-pair/landing-page-find-hub>, <https://support.apple.com/en-us/121488>,
  <https://www.semtech.com/amazon-sidewalk-faqs>, <https://docs.nodle.com/nodle-iot>, <https://kontakt.io/kiocloud-connectivity-and-firmware-sdk/>,
  <https://www.hackster.io/news/wiliot-launches-its-iot-pixels-starter-kit-aims-to-kickstart-the-internet-of-everyday-things-d17a1b675932>
