# Nadajniki BLE do „nawigacji do narzędzia”: przegląd rynku, protokołów i architektur

Data badania: **2026-09-29**. Ceny zapisane z datą sprawdzenia i walutą źródła; przeliczenia na zł są orientacyjne
(założenie robocze: 1 USD ≈ 3,7 zł, 1 GBP ≈ 5 zł, 1 EUR ≈ 4,25 zł; kursów z tego dnia nie sprawdzałem).

Oznaczenia wiarygodności:
- **[Z]** – zweryfikowane na stronie źródłowej (producent, sklep, dokumentacja, repozytorium).
- **[W]** – tylko z fragmentu wyników wyszukiwarki lub z wyciągu ze strony, której nie dało się otworzyć w całości; do potwierdzenia przed zakupem.
- **[?]** – nie udało się zweryfikować, nie zgaduję.

Kontekst domenowy (CONTEXT.md, ADR 0018): „nawigacja do narzędzia” to naturalne rozszerzenie **Wyszukiwania** („gdzie jest narzędzie”).
Dziś Wyszukiwanie mówi, w której **Lokalizacji** (baza, budowa, pojazd, serwis) jest **Narzędzie**, od ilu dni i kto za nie odpowiada –
z historii **Ruchów**, wpisywanych ręcznie. BLE miałoby odpowiadać na pytanie o krok dalej: *w tej lokalizacji, gdzie dokładnie*
(który kontener, półka, bus). Nadajnik nie zastępuje Ruchu, tylko dodaje sygnał „ostatnio słyszany” i tryb „cieplej/zimniej”.

---

## 1. Podsumowanie (tabela modeli)

Kryteria: cena sztuki < 50 zł, otwarty protokół/API/SDK, dostępność w PL/UE.

| Model | Protokoły | Bateria / deklarowana żywotność | Zasięg (deklar., otwarta przestrzeń) | Cena (data 2026-09-29) | Dostępność w PL | Konfiguracja / SDK | Werdykt |
|---|---|---|---|---|---|---|---|
| **Minew MTB09** (Ø22,9×6,3 mm) | iBeacon, Eddystone, BLE 5.0 | 220 mAh, **niewymienna**, ok. 3,5 roku przy 7000 ms [Z] | do 120 m [Z] | **3,99 USD** (ok. 15 zł) za sztukę, sklep Minew, ceny hurtowe: zapytanie [Z] | wysyłka DHL/FedEx/UPS z Chin, brak sklepu PL [Z] | BeaconSET Plus, hasło; UUID/major/minor przez GATT [Z] | Najtańszy kandydat; brak deklaracji IP i odporności [Z] |
| **Minew MTB10** (Ø22,9×4,7 mm) | jw. | 80 mAh, nieważna wymiana, ok. 1,2 roku [Z] | do 80 m [Z] | jw. (wspólna oferta „MTB09 & MTB10” 3,99 USD) [Z] | jw. | jw. | Za krótka żywotność |
| **Minew E8** | iBeacon, Eddystone UID/URL/TLM, akcelerometr | CR2032 wymienna; BeaconZone: „1 rok” [Z] | do 50 m [Z] | **24,58 GBP** brutto UK / **20,48 GBP** bez VAT (ok. 100 zł) [Z] | BeaconZone wysyła do PL, 0% VAT na zamówieniach zagranicznych [Z] | BeaconSET+, domyślne hasło `minew123` [Z] | Ponad limit 50 zł |
| **Minew E7 / B7 / MBS01** | iBeacon, Eddystone | 1000 mAh (E7) [W] | do 100 m (E7) [W] | E7 28,22 GBP, B7 37,79 GBP, MBS01 34,01 GBP (brutto UK) [Z] | jw. | jw. | Ponad limit |
| **Feasycom FSC-BP108** | iBeacon, Eddystone, AltBeacon, IP67 | do 6 lat przy 1300 ms i 0 dBm [Z] | do 400 m [Z] | **102,93 zł** w Kamami, w chwili sprawdzenia **niedostępny** (oferta do 2026-10-14) [Z] | Kamami (PL) | TX −19,5…0 dBm, aplikacja mobilna [Z] | Ponad limit, brak w magazynie |
| **Feasycom FSC-BP103B** | iBeacon, Eddystone, AltBeacon | 3 lata przy 1300 ms, 0 dBm (DA14531) [W] | do 160 m [W] | AliExpress: „od 6,92 EUR” + 4,78 EUR wysyłki [W] | AliExpress PL | app Feasycom, karta katalogowa w FCC [W] | Tani, ale jakość i wysyłka do sprawdzenia |
| **Holyiot nRF52810** (z akcelerometrem) | iBeacon, Eddystone | CR2032 wymienna, deklar. ok. 180 dni [W] | [?] | AliExpress PL **34,99 zł**; Alibaba **8 USD przy 100 szt.** [W] | AliExpress PL | Nordic nRF52810, app Holyiot [W] | Dobry kandydat cenowo |
| **DX-IOT / DX-SMART** (DA14531, IP67) | iBeacon, Eddystone | 6 mies. – 4 lata zależnie od modelu [W] | 50–120 m [W] | AliExpress PL **22,69–44,69 zł** [W] | AliExpress PL | ogólne app [?] | Ostateczność (jakość [?]) |
| **MikroTik TG-BT5-IN** | iBeacon, Eddystone, telemetria MikroTik; BT 5.2, akcelerometr | wbudowane 220 mAh, ok. 2 lata przy 1 s; IP54; 0…70 °C [Z] | [?] | **10 USD** (cena sugerowana producenta) [Z]; Allegro **52,90 zł** [W] | Allegro | konfiguracja przez MikroTik (Quick Guide) [Z] | Ponad limit w PL; ciekawy protokół i dokumentacja |
| **Teltonika EYE Beacon / BTS** | iBeacon, Eddystone | [?] | [?] | Allegro **ok. 145 zł** [W] | Allegro | Teltonika | Za drogi |
| **RuuviTag** | Ruuvi Data Format (otwarty), sensory | CR2477 wymienna, 12–24 mies., IP67, −20…+70 °C [Z] | [?] | **39,90 EUR** (36,90 EUR przy 3–5 szt.) [Z] | UE (Finlandia) | otwarty kod i format [Z] | Za drogi na 200 szt., ale najlepiej udokumentowany otwarty protokół |
| **Blue Charm BC021/BC011** | iBeacon, Eddystone | CR2032, 16 mies. przy 1 s i 0 dBm [W] | [?] | pakiet 3 szt. **108,99 USD** (Amazon US, ok. 36 USD/szt.) [W] | brak sklepu w PL | app Blue Charm | Za drogi |
| **Kontakt.io / Estimote** | iBeacon, Eddystone, własne | [?] | [?] | [?] – brak cen publicznych | Kontakt.io ma siedzibę w Krakowie [W] | chmura Kontakt.io | Nie zweryfikowałem cen; zwykle drożej (założenie, nie fakt) |
| **AirTag / Tile / Chipolo / SmartTag / Pebblebee** | zamknięte sieci Find My / Find Hub / Tile | – | – | – | – | **brak publicznego API** do lokalizacji [Z] | Odpada (rozdz. 1.3) |
| **Tracki** | GPS + komórkowy, nie BLE | – | – | – | – | publiczne API [?] | Poza zakresem (to GPS) |

Najważniejszy wniosek cenowy: **jedyny zweryfikowany model poniżej 50 zł „u źródła” to Minew MTB09 (3,99 USD)**; tagi z AliExpress PL
(ok. 23–45 zł) są w zasięgu, ale kupione z detalu. Sklepy w UE/UK (BeaconZone, Kamami, Allegro) mieszczą się w 50 zł tylko
przypadkowo (MikroTik 52,90 zł ledwo ponad).

---

## 2. Modele i dostawcy – szczegóły

### 2.1 Minew

- **MTB09 / MTB10** – Ø22,9×6,3 / 4,7 mm, 220 / 80 mAh, niewymienna bateria, 3,5 / 1,2 roku, zasięg 120 / 80 m, interwał ogłaszania 7000 ms,
  −20…60 °C, aktywacja wyciągnięciem paska, montaż taśmą dwustronną lub ucho (tylko MTB09), konfiguracja BeaconSET Plus, ochrona hasłem.
  Źródło: <https://www.minew.com/product/mtb09-mtb10-micro-asset-tag/> [Z]. Cena 3,99 USD za sztukę, dostawa kurierska,
  formularz zapytań dla zamówień hurtowych: <https://www.minewstore.com/product/mtb09-mtb10-super-tiny-asset-tag> i <https://www.minewstore.com/> [Z].
  Interwał 7 s wydłuża czas „znalezienia” tagu w trybie cieplej/zimniej (patrz rozdz. 5). Deklaracji IP na stronie nie ma [Z – brak].
- **E8** – strona sklepu BeaconZone: iBeacon i Eddystone (UID/URL/TLM), CR2032 wymienna, „do 50 m”, moc od −30 do +4 dBm:
  <https://www.beaconzone.co.uk/e8>. Konfiguracja slotów (interwał 1000 ms, RSSI@1 m, moc TX) i domyślne hasło `minew123`:
  <https://reelyactive.github.io/diy/minew-e8-config/> [Z]. **Zmień hasło** – tagi z domyślnym hasłem można przekonfigurować.
- **E8S** – 230 mAh, do 4 lat (tylko ramki informacyjne, akcelerometr wyłączony), ok. 1 rok przy ustawieniach domyślnych, do 150 m:
  <https://www.minew.com/product/e8s-accelerometer-sensor-tag/> [Z].
- **Konfigurowalność (UUID/major/minor)** – FAQ Minew: parametry firmware BeaconPlus (UUID, major, minor) ustawiane przez GATT bez własnego firmware:
  <https://www.minew.com/faq/> [Z]. SDK: dokumentacja dla aplikacji mobilnych do odczytu ramek (jw.) [Z]; szczegółów licencji SDK nie badałem [?].
- **Ceny BeaconZone** (brutto UK / bez VAT, GBP, 2026-09-29): E8 24,58 / 20,48; E7 28,22 / 23,52; B7 37,79 / 31,49; MBS01 34,01 / 28,34;
  P1 Plus 44,10 / 36,75 – <https://www.beaconzone.co.uk/Minew> [Z]. Brak rabatów ilościowych na stronie [Z]. Wysyłka do Polski i 0% VAT na
  zamówieniach zagranicznych: <https://www.beaconzone.co.uk/delivery> [Z]. Cło/VAT importowy po stronie UE przy przesyłce z Wielkiej Brytanii to
  moja inferencja, nie sprawdzałem [?].
- **Inne z minewstore.com** (USD, 2026-09-29): MTB08 (temperatura/wibracje) 5,99; MBM04 (przekaźnik/beacon) 16,00 [Z].

### 2.2 Feasycom

- **FSC-BP108** (Kamami): IP67, do 400 m, do 6 lat przy 1300 ms/0 dBm, TX −19,5…0 dBm, −20…+60 °C, obudowa ABS. Cena **102,93 zł**, stan
  „OutOfStock”, `priceValidUntil` 2026-10-14. Opis strony ma literówkę „CR3032” – typ baterii do potwierdzenia [Z/?]:
  <https://kamami.pl/en/rfid/1181665-fsc-bp108-ibeacon-tag-bluetooth-51-5902186328747.html>.
- **FSC-BP103B** (DA14531, BT 5.1): iBeacon, Eddystone (URL/UID/TLM), AltBeacon, LED i przycisk, 3 lata przy 1300 ms/0 dBm, do 160 m [W]:
  <https://www.feasycom.com/product/fsc-bp103b/>, karta w FCC: <https://fcc.report/FCC-ID/2AMWO-FSC-BP103B/5100331.pdf>.
- **FSC-BP104D**: IP67, wymienna bateria, deklarowane „do 10 lat”, do 400 m [W]: <https://www.feasycom.com/product/fsc-bp104d/>.
  Ceny bezpośrednie z feasycom.com nie są publiczne [?].

### 2.3 Holyiot, DX-IOT, inne tanie tagi z Chin

- Holyiot nRF52810: Alibaba – 8 USD przy 100 szt. według wyniku wyszukiwarki, samej strony nie udało się odczytać (JS) [W]:
  <https://www.alibaba.com/product-detail/Holyiot-Mini-Beacon-Tag-Nordic-BT5_1600863493157.html>. Deklarowane IP67, CR2032, ok. 180 dni [W].
- AliExpress PL (lista, 2026-09-29): DX-IOT Mini DA14531 IP67 33,19 zł; Holyiot nRF52810 z akcelerometrem 34,99 zł; DX-SMART CP27 22,69 zł;
  DX-SMART CP35 (wymienna bateria, IP67) 33,29 zł; nRF52810 z czujnikiem temperatury 44,69 zł; darmowa dostawa powyżej 40 zł
  – <https://pl.aliexpress.com/w/wholesale-beacon-bluetooth-eddystone.html> [W – odczyt listy, bez wejścia w oferty].
  Deklarowane parametry sprzedawców (zasięg, żywotność) traktuję jako marketingowe; brak kart katalogowych [?].
- Rabaty ilościowe w AliExpress/Alibaba: **[?]** – wymagają zapytania do sprzedawcy.

### 2.4 MikroTik, Teltonika, Ruuvi, Blue Charm, Kontakt.io

- **MikroTik TG-BT5-IN**: wbudowane 220 mAh, ok. 2 lata przy interwale 1 s (domyślnie 5 s), IP54, 0…70 °C, BT 5.2, akcelerometr (ruch, swobodny
  spadek, pochylenie), formaty iBeacon, Eddystone i telemetria MikroTik, cena sugerowana 10 USD: <https://mikrotik.com/product/tg_bt5_in> [Z].
  Allegro 52,90 zł [W]. Ciekawy, bo producent publikuje dokumentację, ale 70 °C to górna granica pracy, a nie dla narzędzi na słońcu.
- **Teltonika** (Allegro, ok. 145 zł) [W] – poza budżetem.
- **RuuviTag** – 39,90 EUR, rabaty 2–5 szt., CR2477, IP67, otwarty kod i format danych: <https://ruuvi.com/ruuvitag/> [Z]. Za drogi na 200 szt.
- **Blue Charm** – CR2032, 16 mies. [W], 3-pak 108,99 USD [W]: <https://bluecharmbeacons.com/product/bluetooth-ble-ibeacon-bc021-multibeacon-with-button-trigger-and-motion-sensor/>.
- **Kontakt.io / Estimote** – siedziba Kontakt.io w Krakowie [W]; ceny detaliczne i hurtowe nie były publiczne w źródłach, które otworzyłem [?].
  Kontakt.io oferuje własną chmurę (RTLS), co jest zależnością od dostawcy [W].

### 2.5 DIY (ESP32)

- ESP32 jako **skaner/bramka**: opłacalny (ESP32-C3-Zero 21,90 zł w Botland, wynik wyszukiwania z 2026-09-29, brutto/netto niepotwierdzone [W]:
  <https://botland.com.pl/szukaj?controller=search&s=esp32-c3>). Specyfikacja ESP32-C3 (BLE 5 z Long Range, Wi-Fi):
  <https://www.espressif.com/en/products/socs/esp32-c3> [Z].
- ESP32 jako **tag** na baterii: nie badałem poboru w deep sleep ani żywotności [?] – w tym przedziale gotowe tagi są prostsze.

### 2.6 Trackery konsumenckie (AirTag, Tile, Chipolo, SmartTag, Pebblebee)

- **Apple Find My**: dołączenie akcesoriów wymaga programu MFi; publicznego API do pobierania lokalizacji nie ma na stronach Apple
  <https://developer.apple.com/find-my/> [Z]. Sieć jest szyfrowana end-to-end, „nawet Apple i producent” nie widzą lokalizacji [W]
  (<https://www.apple.com/newsroom/2021/04/apples-find-my-network-now-offers-new-third-party-finding-experiences/>).
- **Google Find Hub**: specyfikacja akcesoriów FHN opisuje szyfrowane, ulotne identyfikatory; lokalizację odszyfrowuje tylko właściciel kluczem prywatnym,
  specyfikacja **nie zawiera API** dla dewelopera do odczytu lokalizacji:
  <https://developers.google.com/nearby/fast-pair/specifications/extensions/fmdn> [Z]. Wymóg zgodności z DULT (ochrona przed śledzeniem) [Z].
- Nieoficjalne obejścia (repozytorium GoogleFindMyTools, komercyjne „AirTag API” Airpinpoint) istnieją [W]:
  <https://github.com/leonboe1/GoogleFindMyTools>, <https://airpinpoint.com/solutions/airtag-api>. Ryzyko: łamanie warunków usługi,
  brak gwarancji stabilności; **nie rekomenduję** w produkcie B2B.
- Tile: własna sieć, publicznego API nie znalazłem [?]. Tracki: GPS z modułem komórkowym, więc poza założeniem „nie GPS” [W].
- Dodatkowo w Find My/Find Hub lokalizacja to *ostatnie miejsce przejścia telefonu*, a nie „cieplej/zimniej” po RSSI; nie odpowiada na potrzebę
  nawigacji w obrębie lokalizacji.

---

## 3. Protokoły ogłoszeń BLE

| Protokół | Stan | Uwagi |
|---|---|---|
| **iBeacon** | Własność Apple; specyfikacja dostępna po zaakceptowaniu licencji Apple, licencja dotyczy producentów „Licensed Products” | <https://developer.apple.com/ibeacon/> [Z]. Do odczytu przez nas (konsument beaconów) ryzyko prawne wygląda na niskie, ale to interpretacja, do zapytania prawnika [?]. Dane: UUID (16 B), major, minor (po 2 B), zmierzona moc @1 m. |
| **Eddystone** (Google) | Repozytorium **zarchiwizowane 2022-12-29**, tylko do odczytu | <https://github.com/google/eddystone> [Z]. Ramki UID/URL/TLM nadal wysyłają tagi; nie ma rozwoju standardu. |
| **AltBeacon** | Otwarta specyfikacja (repozytorium AltBeacon); ramka producenta-specyficzna z kodem `0xBEAC`, ID 20 B, referencyjny RSSI 1 B | <https://github.com/AltBeacon/spec> [Z]. Licencji w pobranej treści nie potwierdziłem [?]. |
| **Surowe ogłoszenia / manufacturer data** | Dowolny własny format (np. Ruuvi Data Format, MikroTik telemetry) | Wymaga dekodowania po stronie skanera; zysk: brak zależności od licencji. |
| **Channel Sounding (BT 6.0)** | Nowa funkcja pomiaru odległości w rdzeniu 6.0 | <https://www.bluetooth.com/specifications/specs/core-specification-6-0/> – szczegółów dokładności nie zweryfikowałem [?]; tanich tagów z CS w tym przedziale cenowym nie sprawdzałem [?]. |

Praktyczne wnioski:
1. Do rozpoznania tagu wystarczy iBeacon z unikalnym UUID firmy i major/minor kodowanym z **Kodu** (np. major = kategoria H, minor = numer 3).
   Alternatywa: mapowanie po adresie MAC – ale na iOS aplikacje natywne nie widzą adresu MAC urządzenia (typowe ograniczenie CoreBluetooth, w źródłach
   pierwotnych tego nie sprawdziłem [?]).
2. Ogłoszenia niepodpisane można **sklonować** (ktoś może nadawać ten sam UUID/major/minor); dla ewidencji narzędzi w firmie to ryzyko akceptowalne,
   ale warto to jawnie zapisać w ADR.

---

## 4. Jak odczytać: telefon, bramka, Wi-Fi/MQTT

### 4.1 Telefon w PWA (Web Bluetooth)

- Standardowe Web Bluetooth (GATT) działa w Chrome na Androidzie, ChromeOS, Mac, Windows (Edge od 79; Samsung Internet od 6.4),
  **Safari/iOS nie wspiera i nie planuje**: <https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md> [Z].
- **Skanowanie ogłoszeń** (`navigator.bluetooth.requestLEScan()` / `watchAdvertisements`) – jest za flagą
  `chrome://flags/#enable-experimental-web-platform-features` [Z] (implementation status oraz przykład Chrome:
  <https://googlechrome.github.io/samples/web-bluetooth/scan.html>). Dokumentacja Chrome opisuje skanowanie jako „będzie” (tj. niewdrożone):
  <https://developer.chrome.com/docs/capabilities/bluetooth> [Z]. MDN oznacza całe Web Bluetooth jako eksperymentalne i nie-Baseline:
  <https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API> [Z]. Informacja, że prace są wstrzymane, pochodzi z wyników wyszukiwarki [W].
- Wniosek: **dla PWA w produkcji nie można polegać na skanowaniu** – ani na iOS (Safari), ani na Chrome Android bez ręcznego włączenia flagi.
  Przeglądarka Bluefy w App Store dodaje Web Bluetooth do iOS (<https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055>), ale wsparcia
  `requestLEScan` w niej nie potwierdziłem [?] i wymaga instalacji innej przeglądarki przez pracowników.
- Połączenia GATT z tagiem nie nadają się do „szukania” (jedno połączenie na tag, nadajnik musi być connectable, zużywa baterię).

### 4.2 Aplikacja natywna / Capacitor

- Capacitor nie ma oficjalnej wtyczki BLE [Z] (<https://capacitorjs.com/docs/apis>); popularna wtyczka społeczności
  `@capacitor-community/bluetooth-le` (licencja MIT, gałąź 8.x zgodna z Capacitor 8) ma `requestLEScan` i filtr po `manufacturerData`
  [Z] (<https://github.com/capacitor-community/bluetooth-le>). Zachowania w tle nie są w jej README opisane [Z – brak].
- **Android**: skanowanie wymaga uprawnienia `BLUETOOTH_SCAN`, zaleca się filtry i limit czasu, bo skanowanie zużywa baterię:
  <https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices> [Z].
- **iOS**: ranging iBeaconów przez Core Location wymaga podania UUID i zwraca `immediate/near/far/unknown` oraz `accuracy` w metrach
  (<https://developer.apple.com/documentation/corelocation/determining-the-proximity-to-an-ibeacon-device> [W]);
  skanowanie Core Bluetooth w tle wymaga wskazania usług i modyfikuje dane ogłoszenia
  (<https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)> [W]).
  Nie sprawdziłem, czy Capacitor-owa wtyczka widzi ramki iBeacon na iOS (znane utrudnienia CoreBluetooth z danymi Apple) [?].
- Koszt architektoniczny: zmiana z czystej PWA (por. ADR 0010) na aplikację w sklepach Apple/Google, aktualizacje, konta deweloperskie. Kwoty
  kont deweloperskich nie sprawdzałem [?].

### 4.3 Bramki BLE→Wi-Fi/MQTT/HTTP

- **Minew MG3** (USB, ESP32): JSON przez HTTP(S) lub MQTT po Wi-Fi, filtr RSSI, filtr MAC (regex), filtr surowych ramek (regex); do 200 pakietów/s wg strony Minew
  (<https://www.minew.com/product/mg3-mini-usb-gateway/> [Z]), do 70 urządzeń/s wg bloga BeaconZone
  (<https://www.beaconzone.co.uk/blog/new-minew-mg3/> [W]) – rozbieżność do wyjaśnienia. Zasięg do 100 m (tag 0 dBm).
  Cena BeaconZone 50,39 GBP brutto / 41,99 GBP netto [Z].
- **Minew G1**: BLE→Wi-Fi/Ethernet/LTE, HTTPS i MQTT z TLS; 149,94 GBP brutto / 124,95 GBP netto [Z/W]: <https://www.minew.com/product/g1-iot-bluetooth-gateway/>.
- **Minew MG11** (Wi-Fi, ok. 270 pakietów/s): 25 USD; **MG8** (LTE, USB): 39 USD; sklep <https://www.minewstore.com/> [Z].
- Dokumentacja API bramki Minew ESP32-C3: konfiguracja JSON (`mqtt_url`, `publish_topic`, `http_url`, `scan` itvl/window/passive, `upload_interval` 1–300 s,
  filtr `rssi` −99…0 dBm; uwierzytelnianie HTTP: Basic lub brak): <https://docs.minew.com/iOS/esp32c3_wifi_gw_http_api_user.html> [Z].
- **DIY ESP32**: ESPHome `esp32_ble_tracker` ma wyzwalacze `on_ble_advertise`, `on_ble_service_data_advertise`, `on_ble_manufacturer_data_advertise`
  oraz czujnik `ble_rssi` po MAC: <https://esphome.io/components/esp32_ble_tracker.html> [Z]. Bluetooth Proxy ESPHome jest zaprojektowany pod Home Assistant
  i dokumentacja nie opisuje pracy samodzielnej: <https://esphome.io/components/bluetooth_proxy.html> [Z] – dla nas niepotrzebny. Alternatywa:
  OpenMQTTGateway (ESP8266/ESP32, BLE, MQTT): <https://github.com/DigiH/OpenMQTTGateway> [Z]. ESP32 z ESPHome wymaga własnego mostu do HTTP/MQTT
  i uwagi na przegrzewanie przy agresywnym skanowaniu (ostrzeżenie w dokumentacji ESPHome) [Z].
- **Integracja z Supabase**: Edge Functions przyjmują webhooki (przypadek użycia z dokumentacji):
  <https://supabase.com/docs/guides/functions> [Z]. Bramka Minew potrafi POSTować JSON pod adres HTTP z Basic auth albo bez; w takim wypadku funkcja
  musi mieć własny sekret (lub podpis), a weryfikacja JWT Supabase musi być wyłączona dla tego endpointu – sposobu w dokumentacji nie potwierdziłem [?]. MQTT wymaga
  dodatkowego brokera (nie ma go w naszym stosie).

---

## 5. Dokładność w pomieszczeniu

- **RSSI jest sygnałem szumowym**. Standardowy model: `D = 10^((C0 − RSSI)/(10·n))`, gdzie `C0` = RSSI@1 m, `n` = wykładnik tłumienia; RSSI
  „silnie zależy od środowiska”. Eksperyment z beaconami trzech producentów w dwóch środowiskach: filtry bayesowskie (Kalman, cząsteczkowy, NI) poprawiły
  estymację o **do 30%** względem klasycznego filtrowania, gdy tag i odbiornik są w odległości ≤ 3 m; filtr Kalmana był najskuteczniejszy:
  Mackey i in., <https://arxiv.org/abs/2001.02396> (PDF: <https://arxiv.org/pdf/2001.02396>) [Z].
- Cisco: tagi BLE zapewniają dokładność „na poziomie strefy” (np. pokój), a nie metrową; ściany i konstrukcje metalowe tłumią sygnał:
  <https://spaces.cisco.com/ble-tags/> [Z].
- Minew: metal „pochłania i odbija sygnał 2,4 GHz i może obniżyć siłę sygnału o 50% lub więcej”; nie montować bezpośrednio na metalu; przy montażu
  wyższym niż 3 m antenę kierować w dół: <https://www.minew.com/faq/> [Z]. To dotyczy nas bezpośrednio (narzędzia metalowe).
- Apple ranging zwraca cztery kubełki (`immediate`, `near`, `far`, `unknown`) + dokładność w metrach [W]; dla UX „cieplej/zimniej” wystarczą trzy-cztery poziomy.
- Trilateracja (kilka stałych bramek) wymaga min. 3 odbiorników w zasięgu i kalibracji; na budowie o zmiennym układzie – nierealna. Dokładne błędy w metrach
  z prac przeglądowych (wyniki 0,07–7,8 m z różnych warunków) mam tylko z wyników wyszukiwania [W]; nie oparłbym na nich obietnic produktowych.
- Praktyczna obietnica UX, którą źródła pozwalają obronić: **„jesteś blisko / dalej / bardzo blisko” w promieniu kilku metrów po wygładzeniu RSSI**, nie „idź 4,3 m na północ”.
  Tag przyklejony do metalowego korpusu (np. wiertarka, poziomica) może odczytywać się słabiej niż w powietrzu i w różnym stopniu zależnie od kąta;
  wymaga pomiaru na naszych narzędziach [?].
- Czas znalezienia przez odbiornik zależy od interwału ogłaszania: przy 7 s (MTB09 domyślnie) odświeżanie „cieplej/zimniej” będzie bardzo wolne;
  po skróceniu do 1 s spada żywotność (patrz rozdz. 6).

---

## 6. Baterie i praktyka

- **Pojemności Energizer** (typowe do 2,0 V): CR2032 235 mAh, −30…60 °C, samorozładowanie ok. 1%/rok
  (<https://data.energizer.com/pdfs/cr2032.pdf> [Z]); CR2450 620 mAh, te same limity temperatury
  (<https://data.energizer.com/pdfs/cr2450.pdf> [Z]); CR2477 ok. 1000 mAh [W] (<https://www.farnell.com/datasheets/1496886.pdf>).
- Żywotność producentów: MTB09 3,5 roku @7000 ms; E8 ok. 1 rok (domyślnie) i do 4 lat z ramkami informacyjnymi (E8S); Blue Charm 16 mies. @1 s;
  Feasycom BP108 6 lat @1300 ms/0 dBm; MikroTik 2 lata @1 s; Ruuvi 12–24 mies. (źródła w rozdz. 2). To wartości laboratoryjne producentów –
  nie mierzyłem. Cisco: zakres 1–8 lat, interwały od 100 ms do 10 s, częstsze ogłaszanie skraca żywotność:
  <https://spaces.cisco.com/ble-tags/> [Z].
- **Kompromis**: dla „nawigacji” potrzebne jest krótkie ogłaszanie (~0,5–1 s), a dla żywotności – długie (kilka sekund). Rozwiązanie z akcelerometrem
  (Minew E8/E8S, MikroTik, Holyiot): tag ogłasza wolno na spoczynku, szybko po ruchu; do zbadania przy zakupie próbek [?].
- **Bateria wymienna vs niewymienna**: dla 200 narzędzi niewymienna (MTB09) oznacza wymianę całych tagów co ok. 3 lata; wymienna CR2032/CR2450
  to koszt centów za sztukę, ale otwieranie obudowy i ryzyko utraty szczelności.
- **Odporność**: IP67 deklarują FSC-BP108 [Z], Ruuvi [Z] i niektóre tagi Holyiot/DX-IOT [W]; MikroTik IP54 [Z]; MTB09 nie deklaruje IP [Z – brak].
  Zakres pracy typowo −20…60 °C (MTB09, BP108) [Z]; wnętrze pojazdu na słońcu może przekraczać 60 °C (moja inferencja, nie źródło). Odporność
  na upadki i uderzenia (pomiar w normach IK/upadki) nie została zweryfikowana dla żadnego modelu [?].
- **Mocowanie**: taśma dwustronna lub ucho (MTB09) [Z]; dla metalowych narzędzi zalecane dystans/przekładka niemetalowa (Minew FAQ) [Z];
  dla narzędzi elektrycznych – tag w walizce zamiast na korpusie to kompromis: znajdujemy walizkę, nie narzędzie (do rozstrzygnięcia produktowo).

---

## 7. Rekomendacja: warianty architektury dla PWA + Supabase

Założenia kosztowe dla **200 narzędzi**: tag MTB09 3,99 USD (ok. 15 zł) + rezerwa; tag AliExpress PL ok. 30 zł; tag MikroTik/Allegro 52,90 zł.
Bez dostawy, VAT, cła i kosztów robocizny; bez rabatów hurtowych (nie zweryfikowanych) [?].

### Wariant A – telefon jako skaner, aplikacja Capacitor (rekomendowany dla pilotażu „cieplej/zimniej”)

- Tagi: 200 × ok. 15 zł (MTB09) ≈ **3 000 zł** (799 USD); 200 × ok. 30 zł (AliExpress PL) ≈ 6 000 zł; 200 × 52,90 zł (MikroTik Allegro) ≈ 10 600 zł.
- Bramki: brak. Stały koszt: konta deweloperskie i utrzymanie aplikacji [?].
- Działanie: użytkownik otwiera kartę Narzędzia → „Znajdź” → aplikacja skanuje ramki z ustalonym UUID firmy i major/minor z Kodu, wygładza RSSI
  (Kalman lub średnia krocząca) i pokazuje pasek bliskości. Bez internetu (mieści się w kolejce offline, ADR 0009). Supabase przechowuje tylko mapowanie
  Narzędzie ↔ tag (UUID/major/minor).
- Wady: rezygnacja z „czystej PWA” na telefonach; iOS ma ograniczenia tła; RSSI przy metalu.

### Wariant B – bramki stałe (baza, pojazdy, stałe budowy) → Supabase Edge Function („ostatnio słyszany w…”)

- Tagi jw. (3 000–10 600 zł).
- Bramki: Minew MG3 (ok. 42–50 GBP, ok. 210–250 zł) lub DIY ESP32-C3 (21,90 zł + zasilacz + obudowa, [W]) w każdej **Lokalizacji**, która ma zasilanie i Wi-Fi
  (baza, pojazd z ładowarką). Budowy bez sieci: bramka LTE (Minew MG8 39 USD + SIM, [Z]) lub hotspot – koszt SIM [?]. Przykład: 1 baza + 10 pojazdów/budów ≈ 2 000–3 000 zł.
- Działanie: bramka co 1–300 s wysyła JSON (MQTT lub HTTP) → Edge Function → tabela „ostatnio słyszany” (tag, bramka=Lokalizacja, RSSI, czas).
  Wyszukiwanie może wtedy powiedzieć „ostatnio słyszany w busie X 12 minut temu”. To wzbogaca dane, ale **nie tworzy Ruchów** (historia Ruchów tylko się dopisuje
  ręcznie) – decyzję o ewentualnych automatycznych podpowiedziach trzeba podjąć produktowo.
- Wady: koszt instalacji; brak „cieplej/zimniej” w obrębie strefy; wymaga zasilania i sieci.

### Wariant C – hybryda A + B (docelowy)

- Wariant B jako baza „gdzie ostatnio” + wariant A jako końcowe 5 m „cieplej/zimniej”. Koszt: suma. Zalety: alarm „narzędzie opuściło bazę bez Ruchu”
  (na podstawie zaniku sygnału) do rozważenia; ryzyko: najwięcej pracy.

### Nie rekomenduję

- PWA z `requestLEScan` w produkcie (flaga, brak iOS) – tylko do szybkiego prototypu na własnym Androidzie z włączoną flagą.
- Tagów Find My/Find Hub (brak API, szyfrowane, pełna zależność od Apple/Google).

### Wstępna rekomendacja zakupowa

1. Zamów **próbki 10–20 szt. każdego z 3 typów**: Minew MTB09 (3,99 USD), Holyiot nRF52810 z akcelerometrem (34,99 zł AliExpress PL), MikroTik TG-BT5-IN (10 USD MSRP / 52,90 zł Allegro).
   Test: przyklejone do wiertarki, młota, poziomicy, w walizce; pomiar RSSI z odległości 1, 3, 5, 10 m.
2. Zapytaj Minew o **cenę hurtową 200 szt. MTB09/E8S** i termin dostawy do UE (formularz na minewstore.com/contact-us, według strony).
3. Zamów **1 bramkę Minew MG3** i zbuduj **1 ESP32-C3** do porównania (koszt ok. 300 zł łącznie).

---

## 8. Ryzyka i pytania otwarte

**Techniczne**
- Skanowanie w PWA: brak wsparcia iOS/Safari, Chrome Android tylko za flagą – potwierdza konieczność aplikacji natywnej.
- Widoczność ramek iBeacon w aplikacji na iOS przez wtyczkę Capacitor: nieznana [?].
- Wpływ metalu: narzędzia z korpusem metalowym mogą tłumić sygnał (Minew: ≥ 50%); wymaga testu i decyzji, gdzie mocować tag.
- Interwał ogłaszania vs bateria: brak zmierzonych danych dla naszych tagów.
- Klonowanie/spoofing ramek iBeacon i domyślne hasła (Minew `minew123`).
- Ceny i dostępność z Chin (AliExpress/Alibaba) bez gwarancji jakości; brak kart katalogowych.
- Odporność na upadki/kurz/deszcz nie zweryfikowana dla żadnego modelu.

**Prawne**
- Licencja iBeacon (Apple) i możliwość użycia formatu w produkcie: do opinii prawnej [?]. Wariant bez iBeacon: własny format / AltBeacon.
- Śledzenie narzędzi może pośrednio wskazywać lokalizację pracowników (RODO); potrzebna informacja dla załogi. Decyzja właściciela.
- Import z Chin/UK: VAT i cło [?].

**Produktowe**
- Kto ma skanować: każda rola (także Pracownik) czy tylko Kierownik/Magazynier? (patrz ADR 0018 – Wyszukiwanie dla każdej roli).
- Czy tag ma być nierozłączny z Narzędziem (zmiana baterii, wymiana tagu = nowy rekord w ewidencji)? Kod (H-03) ↔ (UUID, major, minor) powinien mieć własną tabelę
  i historię wymian tagów.
- Model cenowy dla Firmy: czy tagi są sprzedawane razem z abonamentem?
- Potrzebny jest ADR o architekturze odczytu (A/B/C) i o tym, czy PWA zostaje jedynym klientem.

---

## 9. Lista źródeł (pierwotne i sklepowe)

- Web Bluetooth – status wdrożeń: <https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md>
- Chrome – Web Bluetooth i skanowanie: <https://developer.chrome.com/docs/capabilities/bluetooth>, przykład <https://googlechrome.github.io/samples/web-bluetooth/scan.html>
- MDN Web Bluetooth API: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API>
- Apple iBeacon: <https://developer.apple.com/ibeacon/>; Core Location: <https://developer.apple.com/documentation/corelocation/determining-the-proximity-to-an-ibeacon-device>
- Eddystone: <https://github.com/google/eddystone>; AltBeacon: <https://github.com/AltBeacon/spec>
- Apple Find My (MFi): <https://developer.apple.com/find-my/>; Google Find Hub: <https://developers.google.com/nearby/fast-pair/specifications/extensions/fmdn>
- Minew: <https://www.minew.com/product/mtb09-mtb10-micro-asset-tag/>, <https://www.minew.com/product/e8s-accelerometer-sensor-tag/>, <https://www.minew.com/product/mg3-mini-usb-gateway/>, <https://www.minew.com/faq/>, <https://www.minewstore.com/>, <https://docs.minew.com/iOS/esp32c3_wifi_gw_http_api_user.html>
- BeaconZone: <https://www.beaconzone.co.uk/Minew>, <https://www.beaconzone.co.uk/e8>, <https://www.beaconzone.co.uk/delivery>
- reelyActive (konfiguracja E8): <https://reelyactive.github.io/diy/minew-e8-config/>
- Feasycom: <https://www.feasycom.com/product/fsc-bp103b/>, <https://www.feasycom.com/product/fsc-bp104d/>; Kamami: <https://kamami.pl/en/rfid/1181665-fsc-bp108-ibeacon-tag-bluetooth-51-5902186328747.html>
- MikroTik TG-BT5-IN: <https://mikrotik.com/product/tg_bt5_in>; Ruuvi: <https://ruuvi.com/ruuvitag/>
- AliExpress PL (lista): <https://pl.aliexpress.com/w/wholesale-beacon-bluetooth-eddystone.html>
- ESPHome: <https://esphome.io/components/esp32_ble_tracker.html>, <https://esphome.io/components/bluetooth_proxy.html>; OpenMQTTGateway: <https://github.com/DigiH/OpenMQTTGateway>
- Espressif ESP32-C3: <https://www.espressif.com/en/products/socs/esp32-c3>
- Capacitor: <https://capacitorjs.com/docs/apis>; wtyczka BLE: <https://github.com/capacitor-community/bluetooth-le>
- Android BLE: <https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices>
- Supabase Edge Functions: <https://supabase.com/docs/guides/functions>
- Energizer: <https://data.energizer.com/pdfs/cr2032.pdf>, <https://data.energizer.com/pdfs/cr2450.pdf>
- Dokładność RSSI: <https://arxiv.org/abs/2001.02396>; Cisco: <https://spaces.cisco.com/ble-tags/>
