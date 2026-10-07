# Tanie lokalizatory GPS na narzędzia: urządzenia, łączność w Polsce, integracja, koszty

Data badania: **2026-09-29**. Ceny sprawdzone tego dnia, w walucie źródła. Przeliczenia na zł są orientacyjne, z tym samym założeniem
co w poprzednich researchach (1 USD ≈ 3,7 zł, 1 GBP ≈ 5 zł, 1 EUR ≈ 4,25 zł; kursów dnia nie sprawdzałem).

Dokument zastępuje kierunek z [nadajniki-ble-nawigacja-do-narzedzi.md](nadajniki-ble-nawigacja-do-narzedzi.md) i
[przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md) (tagi BLE + bramki + telefony), który okazał się za trudny
we wdrożeniu. Założenie teraz: **urządzenie przyczepione do narzędzia samo wysyła pozycję przez sieć komórkową, a my nie stawiamy
żadnej infrastruktury radiowej**. Wystarczy dokładność „mniej więcej gdzie”: baza, która budowa, bus.

Oznaczenia jak wcześniej: **[Z]** zweryfikowane u źródła (strona producenta, dokumentacja, sklep), **[W]** tylko z wyników wyszukiwarki
albo streszczenia strony, **[?]** niezweryfikowane lub moja inferencja.

Pojęcia domenowe wg [CONTEXT.md](../../CONTEXT.md): **Narzędzie**, **Lokalizacja** (baza, budowa, serwis, pojazd), **Ruch**.

---

## 0. Podsumowanie

1. **Da się to zrobić prosto, ale nie „za grosze”.** Lokalizator komórkowy z baterią na lata kosztuje realnie **80–120 EUR / 330–480 zł netto**
   za sztukę. Tańsze urządzenia (Teltonika TAT100 za 238 zł, chińskie „magnetyczne 4G” z Allegro/Amazon) mają albo tylko 2G, które
   operatorzy zaczną wygaszać od 2028 r., albo akumulator na tygodnie–miesiące i zamkniętą chińską platformę.
2. **Łączność jest tania i rozwiązana**: karta **1NCE** kosztuje **12 EUR za 10 lat** (500 MB, 250 SMS) + 1–2,50 EUR za kartę [Z].
   Według listy pokrycia 1NCE z kwietnia 2026 w Polsce działa **2G, 3G, 4G i LTE-M, bez NB-IoT** [Z]. Orange podaje zasięg LTE-M
   dla 99,8% populacji [Z]. Karty krajowe (Orange M2M przez partnera) kosztują kilka–kilkanaście zł miesięcznie [Z/W].
3. **LoRaWAN i Sigfox odpadają.** TTN ma bramki głównie w dużych miastach [W]. Sigfox Poland Sp. z o.o. została **wykreślona z KRS
   3 grudnia 2024** [Z], mimo że sigfox.com nadal pokazuje Polskę jako pokrytą [Z]. Oba warianty wymagają własnych bramek na budowach,
   czyli infrastruktury, której chcemy uniknąć.
4. **GPS nie działa w budynku, piwnicy i metalowej skrzyni.** Urządzenia, które dodatkowo skanują **Wi-Fi** (Digital Matter Yabby Edge,
   Oyster Edge, Mictrack MT700-NW), dają wtedy pozycję ok. 10–100 m. Bez Wi-Fi zostaje stacja bazowa (ok. 250 m – 1 km) [Z – Digital Matter].
5. **Najprostsza droga danych do Supabase** to chmura producenta, która sama wysyła **HTTPS POST z JSON-em** na nasz endpoint
   (Supabase Edge Function). Tak działa **Digital Matter Device Manager** [Z]. Teltonika i Mictrack mówią własnymi protokołami TCP,
   więc potrzebują pośrednika (Traccar na małym serwerze albo flespi) [Z].
6. **Rekomendacja**: **Digital Matter Yabby Edge Cellular** (LTE-M, 3×AAA wymienialne, ok. 8 lat przy 4 raportach dziennie, GNSS + Wi-Fi + stacja,
   IP68, 85 g) + 1NCE + Device Manager → webhook → Edge Function. Wariant tańszy bez abonamentu producenta: **Mictrack MT700-NW**
   (LTE-M, 3×AA, do 7 lat przy 1 raporcie dziennie) + Traccar. Zacząć od **20–50 najcenniejszych narzędzi**, nie od 200.
   Koszt 3 lat: ok. **15–16 tys. zł za 20 szt.**, **34–35 tys. zł za 50 szt.**, ok. **130 tys. zł za 200 szt.** (Digital Matter; szczegóły w rozdz. 4).

### Tabela porównawcza

| Urządzenie | Sieć | Bateria i żywotność (deklaracja) | Pozycja w budynku | Rozmiar / waga / IP | Cena sztuki (2026-09-29) | Integracja | Abonament producenta |
|---|---|---|---|---|---|---|---|
| **Digital Matter Yabby Edge Cellular** | LTE-M / NB-IoT [Z] | 3×AAA lit, wymienialne; **10 lat przy 1/dzień, 8 lat przy 4/dzień**, 2 lata przy 24/dzień [Z] | GNSS + **Wi-Fi** + stacja, rozwiązywane w chmurze [Z] | 84×63×24 mm, 85 g, **IP68, IK06** [Z] | **97,46 EUR brutto (19% VAT)** iot-shop.de, „Not Available For Sale” [Z]; 162,26 GBP netto RRP Alliot UK [Z] | **HTTPS JSON POST** z Device Manager [Z] | **tak**: Device Manager 1,49 EUR/mies./szt. (reseller) [Z]; opłaty Location Engine za lookup [Z], kwoty w cenniku DM [?] |
| **Digital Matter Yabby3 Cellular** | LTE-M / NB-IoT [Z] | 3×AAA; 10 lat przy 1/dzień, **5,5 roku przy 4/dzień** [Z] | GNSS na urządzeniu, awaryjnie stacja [Z]; Wi-Fi wg sklepu [W] | 84×63×24 mm, 90 g, IP68, IK06 [Z] | **118,88 EUR brutto** iot-shop.de, „Not Available For Sale” [Z] | HTTPS JSON (Device Manager) albo TCP „direct” [Z] | Device Manager 1,19 EUR/mies./szt. (reseller) [Z] |
| **Digital Matter Oyster Edge / Oyster3** | LTE-M / NB-IoT [Z] | 3×AA; Oyster Edge **10+ lat przy 4/dzień**, 4,5 roku przy 24/dzień [Z] | Edge: GNSS + Wi-Fi + stacja [Z] | Oyster3: 108×86×30 mm, 166 g, IP68, IK07 [Z] | cena tylko w ofercie [W] | jak wyżej | jak wyżej |
| **Mictrack MT700 / MT700-NW** | LTE-M / NB-IoT + 2G [Z] | wersja N/NW: 3×AA Li-FeS2, **do 7 lat przy 1/dzień** [Z]; wersja z akumulatorem 7800 mAh do 3 lat [Z] | GPS + LBS; **Wi-Fi tylko w -W/-NW** [Z] | 88×62×34 mm, **290 g**, IP68, magnes [Z] | **79,99–109,99 USD** (sklep Mictrack, bez wysyłki, cła i VAT) [Z] | własny protokół TCP/UDP → **Traccar** (protokoły `tlt2h`/`mictrack`) [Z] | nie [Z] |
| **Teltonika TAT240** | **LTE Cat 1** + 2G (pasma B1/3/5/7/8/20/28) [Z] | Li-SOCl2 2200 mAh 7,2 V wymienny; **do 3 lat** (częsty ruch), do 5 lat (rzadki) [Z – wisp.pl] | tylko GNSS, bez Wi-Fi [Z] | 77,5×61,5×27,5 mm, 115 g, IP68, magnes, czujnik zdjęcia [Z] | **390,95 zł netto / 480,87 zł brutto** wisp.pl [Z] | Codec Teltonika TCP → Traccar/flespi [?]; TAT240 nie ma na liście Traccar, TAT100/TAT140 są (`teltonika`, port 5027) [Z] | nie [?] |
| **Teltonika TAT100** | **tylko 2G** [Z] | Li-SOCl2 2200 mAh; ok. 1 rok przy 1/dzień [W] | tylko GNSS [Z] | 78×63 mm, 119 g, IP68 [W] | 238 zł Allegro [W] | jak wyżej, na liście Traccar [Z] | nie |
| **Teltonika TAT141** (LTE-M) | LTE-M / NB-IoT / 2G [Z] | 2200 mAh Li-SOCl2, do 3 lat [W] | tylko GNSS [Z] | 78×63×28 mm, IP68 [Z] | **wycofany (EOL), brak w magazynie** [Z] | — | — |
| **Queclink GL50MG / GL53MG** | LTE-M / NB-IoT [W] | do 3 lat „przy typowych profilach” [W] | [?] | IP67 [W] | [?] | protokół `gl200` → Traccar [Z] | nie [?] |
| **Winnes TK905B** (klasa „magnetyczne 4G z Amazonu/Allegro”) | 4G (kategoria nieopisana) [Z] | **akumulator 10 000 mAh, do 80 dni czuwania** [Z] | GPS + LBS [Z] | 90×72×32 mm, 235 g, IP65 [Z] | 121,99 EUR [Z] | własna platforma mytkstar.net, podsłuch mikrofonem [Z] | nie [Z] |
| **SenseCAP T1000-A** (LoRaWAN) | LoRaWAN EU868 [Z] | akumulator 700 mAh, >3 mies. przy 1/h [W] | GNSS + Wi-Fi + BLE [Z] | 85×55×6,5 mm, IP65 [W] | **39,90 USD** [Z] | TTN/Helium webhook [W] | nie, ale potrzebna sieć LoRaWAN |
| **MOKO LW001-BG PRO** (LoRaWAN) | LoRaWAN EU868 [Z] | 3×ER18505, do 5 lat [Z] | GPS + BLE + Wi-Fi [W] | IP67 [Z] | **78,42 EUR brutto** iot-shop.de, niedostępny [Z] | TTN webhook [?] | nie, ale potrzebna sieć LoRaWAN |

---

## 1. Urządzenia – szczegóły

### 1.1 Digital Matter (Australia) – Yabby Edge, Yabby3, Oyster Edge, Oyster3

- **Yabby Edge Cellular**: 3×AAA lit wymienialne przez użytkownika, LTE-M i NB-IoT (Nordic nRF9160), GNSS (GPS, BeiDou) + skan punktów
  Wi-Fi + stacja bazowa. Dokładność wg producenta: GNSS ok. 5–80 m, **Wi-Fi ok. 10–100 m**, stacja ok. 250 m – 1 km. 84×63×24 mm, 85 g,
  IP68, IK06, akcelerometr, tryb okresowy albo „przy ruchu”, 2 lata gwarancji:
  <https://www.digitalmatter.com/devices/yabby-edge-cellular/> [Z].
- **Jak Edge oszczędza baterię**: urządzenie budzi się, przez ok. 8–14 s skanuje GNSS i Wi-Fi i wysyła surowe dane; pozycję liczy serwer.
  Producent podaje zużycie „about 1/10th of the energy of on-board GPS”. Tabela żywotności (Yabby3 / Yabby Edge): 1 raport dziennie
  10 / 10 lat, 2 raporty 7,5 / 10 lat, **4 raporty 5,5 / 8 lat**, 12 raportów 3 / 3,5 roku, 24 raporty 1,5 / 2 lata:
  <https://support.digitalmatter.com/battery-life-estimates-[yabby-edge-cellular]> [Z]. Oyster Edge (3×AA): 1–4 raporty dziennie
  „10+ lat”, 12 raportów 8 lat, 24 raporty 4,5 roku: <https://support.digitalmatter.com/battery-life-estimates-[oyster-edge]> [Z].
  Na żywotność wpływają zasięg, **wybór karty SIM (karta roamingowa może szybciej zużywać baterię)**, montaż i temperatura (ta sama strona [Z]).
  To dotyczy 1NCE, która w Polsce działa w roamingu [?].
- **Yabby3** (starsza, GNSS liczony na urządzeniu, ok. 2 m CEP, awaryjnie dane stacji): 84×63×24 mm, 90 g, IP68, IK06, 1,5 roku przy
  raportach co godzinę: <https://www.digitalmatter.com/devices/yabby3/> [Z].
- **Oyster3**: 3×AA, 108×86×30 mm, 166 g, IP68, IK07, −30…+60 °C, ok. 6 lat w trybie „przy ruchu”, 3,5 roku przy raportach co godzinę:
  <https://www.digitalmatter.com/devices/oyster3/> [Z]. Większy, do agregatów i skrzyń.
- **Ceny**: Yabby Edge Cellular **97,46 EUR z 19% VAT** (ok. 81,90 EUR netto), bez baterii, status „Not Available For Sale”:
  <https://iot-shop.de/en/shop/dim-yabby-edge-4g-digital-matter-yabby-edge-cellular-tracker-7561> [Z]. Yabby3 4G **118,88 EUR z VAT**,
  także „Not Available For Sale”: <https://iot-shop.de/en/shop/dim-yabby3-4g-digital-matter-yabby3-tracker-7297> [Z].
  Alliot (UK) podaje Yabby Edge za **162,26 GBP + VAT (RRP)**, rabat hurtowy na zapytanie:
  <https://www.alliot.co.uk/product/Digital-Matter-Yabby-Edge-4G-LTE-M-NB-IoT-Tracker/64837000004622622> [Z]. Rozrzut cen jest duży,
  więc na 50–200 szt. trzeba wziąć ofertę od dystrybutora [?].
- **Abonament producenta**: iot-shop.de podaje Device Manager **1,49 EUR/mies./szt. dla urządzeń Edge**, 1,19 EUR dla Yabby3,
  Telematics Guru 1,59–3,79 EUR, „forwarding” 18,90 EUR/mies. za połączenie, rozliczenie roczne z góry, 3 miesiące wypowiedzenia (strony sklepu jak wyżej [Z]).
  Digital Matter pisze, że opłata Device Manager dotyczy urządzenia, które ma ustawiony konektor do zewnętrznej platformy i łączy się
  **więcej niż 8 razy w miesiącu**: <https://support.digitalmatter.com/en_US/reports-device-manager/device-manager-billing> [Z].
  **Location Engine** (rozwiązywanie Wi-Fi i stacji, w Edge także GNSS) jest płatny od urządzenia i od każdego zapytania, bez darmowej puli.
  Kwoty są w cenniku DM dla partnerów: <https://support.digitalmatter.com/location-engine-billing> [Z]. **Kwot nie znam** [?].
- **Tryb „direct to 3rd party” (bez opłat DM)** wymaga własnego serwera TCP w protokole DM. Nie działa wtedy Location Engine, nie ma
  aktualnych danych wspomagających GNSS („YOU WILL NOT GET OPTIMAL PERFORMANCE AND BATTERY LIFE”), a aktualizacje firmware wymagają
  okresowego łączenia z Device Manager: <https://support.digitalmatter.com/en_US/integration/direct-to-3rd-party-server-integration-considerations> [Z].
  Dla nas to odpada.
- **Karta SIM**: urządzenie ma wewnętrzny slot nano SIM [Z]. Czy dystrybutor dostarcza je z własną kartą, czy włożymy 1NCE: [?], do ustalenia w ofercie.

### 1.2 Mictrack (Chiny) – MT700

- MT700: LTE-M i NB-IoT z fallbackiem 2G, pasma m.in. B20 i B8. Wersje N/NW: **3×AA Li-FeS2 (3400 mAh każda), do 7 lat przy 1 raporcie
  dziennie**; wersje z akumulatorem 7800 mAh do 3 lat. Czuwanie < 1,5 µA. GPS, LBS, A-GPS; **Wi-Fi tylko w MT700-W / MT700-NW**.
  88×62×34 mm, **290 g**, IP68, magnes, alarm zdjęcia. Protokoły TCP, UDP, SMS, „Open Protocol”. Cena **79,99–109,99 USD**:
  <https://shop.mictrack.com/product/cat-m1-nb-iot-asset-gps-tracker-mt700/> [Z]. Strona produktu: „ponad 1370 dni pracy” w teście
  producenta, własny serwer bez abonamentu: <https://www.mictrack.com/product/cat-m1-nb-iot-asset-gps-tracker/> [Z].
  Tabeli żywotności przy 2–4 raportach dziennie producent nie podaje [Z]. Moje szacunki bez testu: [?].
- Traccar obsługuje MT700 i MT710 (protokoły `tlt2h`, port 5030, i `mictrack`, port 5191): <https://www.traccar.org/devices/> [Z].
- Import z Chin: do ceny dochodzi wysyłka, VAT 23% i ewentualne cło [?]. Brak polskiego dystrybutora w wynikach [?].
- MT710 (35 g, akumulator 650 mAh, ok. 1 rok przy 1 raporcie dziennie) to lokalizator osobisty/dla zwierząt, za mała bateria na narzędzia [W].

### 1.3 Teltonika (Litwa) – TAT100, TAT140, TAT141, TAT240

- **TAT240**: LTE **Cat 1** (nie LTE-M) z fallbackiem 2G, Li-SOCl2 7,2 V 2200 mAh wymienna, 77,5×61,5×27,5 mm, IP68, uchwyt magnetyczny
  z wykrywaniem zdjęcia, GNSS −165 dBm, akcelerometr, **bez skanu Wi-Fi**, praca −20…+60 °C (bez baterii):
  <https://wiki.teltonika-gps.com/view/TAT240_General_description> [Z]. Cena **390,95 zł netto / 480,87 zł brutto**, w magazynie, waga 115 g,
  „do 3 lat” przy częstym ruchu i do 5 lat przy rzadkim: <https://www.wisp.pl/p11884,teltonika-tat240.html> [Z].
  Teltonika w wiki podaje tylko krzywe rozładowania, bez tabeli „raporty/dzień → lata”:
  <https://wiki.teltonika-gps.com/view/TAT240_Battery_Discharge_Characteristics> [Z].
- **TAT141** (LTE-M/NB-IoT/2G, Quectel BG95-M3, 2200 mAh, IP68, 78×63×28 mm, bez Wi-Fi): <https://wiki.teltonika-gps.com/view/TAT141_General_description> [Z].
  Na stronie produktu ma status **EOL i brak w magazynie**: <https://www.teltonika-gps.com/products/trackers/assets-workforce/tat141> [Z].
  Następcy LTE-M nie znalazłem [?].
- **TAT100**: **tylko 2G** (GSM/GPRS), Li-SOCl2 2200 mAh: <https://wiki.teltonika-gps.com/view/TAT100_General_description> [Z].
  Allegro: 238 zł, ok. 1 rok przy 1 raporcie dziennie [W]. TAT140 to LTE Cat 1 z fallbackiem 2G:
  <https://wiki.teltonika-gps.com/view/TAT140> [Z].
- **Integracja**: protokół Teltonika (TCP). Traccar ma na liście TAT100 i TAT140 (protokół `teltonika`, port 5027); TAT240 formalnie nie ma
  go na liście, ale używa tego samego kodeka [?]: <https://www.traccar.org/devices/> [Z].
- **Ocena**: sprzęt solidny i dostępny w Polsce od ręki, ale brak Wi-Fi (w budynku tylko ostatnia pozycja albo nic), Cat 1 zużywa więcej
  energii niż LTE-M [?], a TAT100 to 2G.

### 1.4 Queclink

- GL50MG: LTE-M/NB-IoT, IP67, „do 3 lat” przy typowych profilach, BLE, przycisk; następca GL53MG [W – wyniki wyszukiwania,
  strony queclink.com zwracały 404]. Seria GL300 ma akumulator 2600 mAh, około 14 dni przy śledzeniu w czasie rzeczywistym [W].
- Traccar obsługuje GL50B, GL53MG, GL500MG, GL520MG itd. (protokół `gl200`, port 5004): <https://www.traccar.org/devices/> [Z].
- Ceny w UE: [?]. Queclink sprzedaje głównie przez integratorów.

### 1.5 Tanie „4G z magnesem” (Winnes, Sinotrack, AliExpress/Allegro)

- Winnes TK905B: akumulator 10 000 mAh, **do 80 dni czuwania**, IP65, 235 g, GPS do 5 m, 121,99 EUR, platforma **mytkstar.net**,
  aplikacja WINNES GPS, **„voice monitoring”** (mikrofon): <https://www.winnes.com/products/4g-gps-tracker-strong-magnetic-10000mah-battery-ip65-waterproof-real-time-tracking-devices-gps-locator-with-free-app-pc-platform-car-tracker-devices-anti-lost-for-motorcycle-truck-boat-tk905b> [Z].
  Opcji zmiany serwera na własny producent nie opisuje [Z].
- Sinotrack ST-901/ST-902W to lokalizatory samochodowe zasilane z instalacji. Traccar je obsługuje (`h02`, `jt808`) [Z], ale to nie są urządzenia bateryjne na lata.
- **Ocena**: ładowanie co 1–3 miesiące przy 200 narzędziach to praca na pół etatu. Zamknięta chińska platforma i mikrofon na budowie
  oznaczają problem z RODO. Odpada.

### 1.6 LoRaWAN (SenseCAP T1000, MOKO LW001-BG PRO, Dragino)

- SenseCAP T1000-A: 39,90 USD, GNSS + Wi-Fi + BLE, przycisk, buzzer: <https://www.seeedstudio.com/SenseCAP-Card-Tracker-T1000-A-p-5697.html> [Z];
  akumulator 700 mAh, >3 mies. przy 1 raporcie/h (tylko GNSS), IP65, 85×55×6,5 mm [W].
- MOKO LW001-BG PRO: 78,42 EUR brutto, 3×ER18505, do 5 lat, IP67, niedostępny: <https://iot-shop.de/en/shop/mok-lw001-bg-pro-mokosmart-lw001-bg-pro-lorawan-gps-tracker-6611> [Z].
- Dragino LGT-92 (1000 mAh albo AA) i TrackerD (ESP32, 1000 mAh, GPS/Wi-Fi/BLE) [W].
- Rozwiązywanie Wi-Fi dla tych urządzeń opierało się na Semtech LoRa Cloud. Wyniki wyszukiwania mówią o wygaszeniu LoRa Cloud
  (Join Server 31.07.2025, także Modem & Geolocation) [W], a dokumentacja LoRa Cloud nadal jest online bez daty końca [Z – strona dokumentacji]. Stan: [?].
- **Sieć to główny problem** (rozdz. 2.3). Urządzenia są tanie, ale bez bramki przy budowie nic nie dotrze.

---

## 2. Łączność i abonamenty w Polsce

### 2.1 1NCE

- **IoT Lifetime Flat: 12 EUR jednorazowo za 10 lat**, 500 MB danych (do 1 Mbit/s), 250 SMS, API, Data Streamer, blokada IMEI, eUICC.
  Karta: Business 1 EUR, Industrial 2 EUR, chip 2,50 EUR. Doładowanie: 10 EUR za 500 MB + 250 SMS; przedłużenie o kolejne 10 lat 12 EUR:
  <https://www.1nce.com/en-eu/1nce-connect/pricing> [Z]. Czy oferta jest tylko dla firm i czy jest minimalne zamówienie: [?].
- **Pokrycie w Polsce** (lista „As of April 2026”, odczytane z PDF): **2G ✓, 3G ✓, 4G ✓, LTE-M ✓, NB-IoT ✗**:
  <https://a.storyblok.com/f/335000/x/8f7999b185/1nce-coverage-en.pdf> [Z]. Na urządzeniu trzeba więc wymusić LTE-M (albo Cat 1), bez NB-IoT.
  Z czyjej sieci 1NCE korzysta w Polsce, lista nie podaje [?]. 3G jest oznaczone, choć polscy operatorzy je wyłączają [W].
- **Czy 500 MB wystarczy**: 4 raporty dziennie przez 10 lat to ok. 14 600 sesji. Przy 10–30 kB na sesję (TLS, nagłówki) wychodzi ok. 150–450 MB [?].
  Przy 1–2 raportach dziennie jest duży zapas. Przy 4 i nieoszczędnym protokole może trzeba będzie doładować (10 EUR). Do pomiaru w pilotażu.

### 2.2 Operatorzy krajowi

- **Orange LTE-M**: zasięg dla 99,8% populacji, lepsza penetracja (do −155 dBm wobec −148 dBm dla zwykłego LTE), eDRX/PSM. Karty tylko
  przez partnerów M2M (np. AKM Sp. z o.o.): <https://orange-m2m.pl/lte-m.html> [Z].
- Taryfa Telemetryczna Orange u partnera: pakiety danych 5 MB za 5 zł netto, 10 MB za 7,50 zł, 20 MB za 10 zł, 50 MB za 12 zł;
  obejmuje LTE-M i Cat 1: <https://orange-m2m.pl/tt10.html> [Z – streszczenie strony, abonament i czas umowy niejasne].
  Czyli ok. **60–90 zł rocznie na urządzenie**, 3 lata × 200 szt. to ok. 36–54 tys. zł. 1NCE na 10 lat kosztuje ok. 55 zł za sztukę.
- T-Mobile ma NB-IoT (LTE 800) i mapę zasięgu z warstwą NB-IoT [W]; Plus i T-Mobile oferują karty M2M, ceny na zapytanie [W].
  Mapy: <https://www.t-mobile.pl/d/mapa-zasiegu> [W].
- **2G**: T-Mobile zapowiada utrzymanie zasięgu 2G do 31.12.2027 i stopniowe wygaszanie od 2028. Orange trzyma 2G co najmniej do 2028.
  Plus zaczyna przygotowania od końca 2026 do 2027 [W – spidersweb.pl, tabletowo.pl]. **Urządzeń tylko 2G (TAT100) nie kupować.**

### 2.3 LoRaWAN i Sigfox w Polsce

- **TTN**: bramki głównie w Warszawie, Krakowie, Wrocławiu, Trójmieście i Poznaniu, poza centrami często brak [W – elmark.com.pl].
  Limit TTN Sandbox: 30 s czasu nadawania na dobę i 10 downlinków na dobę na urządzenie: <https://www.thethingsnetwork.org/docs/lorawan/duty-cycle/> [Z].
- **Orange LoRa**: jeden tekst branżowy nazywa ją komercyjną siecią w wybranych miastach [W], a poradnik Orange o LoRaWAN nie opisuje
  publicznej sieci ani cennika: <https://www.orange.pl/poradnik-dla-firm/iot/sieci-lorawan/> [Z]. **Netemera** (dawna publiczna sieć LoRaWAN
  wokół Warszawy): domena netemera.com nie odpowiada (DNS ENOTFOUND, 2026-09-29) [Z].
- **Helium** w Polsce: [?], nie sprawdzałem mapy.
- **Sigfox**: sigfox.com wymienia „Sigfox Poland” jako operatora [Z – <https://www.sigfox.com/coverage/>], ale spółka
  **SIGFOX POLAND Sp. z o.o. w likwidacji** weszła w likwidację 17.01.2023 i została **wykreślona z KRS 3.12.2024**:
  <https://www.imsig.pl/krs/0000679746> [Z]. Na nową inwestycję się nie nadaje.
- **Wniosek**: na budowach poza dużymi miastami LoRaWAN realnie wymaga własnej bramki (z LTE) na budowę, czyli tej samej infrastruktury,
  z której rezygnujemy. **Tylko sieć komórkowa (LTE-M / Cat 1) spełnia założenie „bez infrastruktury”.**

---

## 3. Integracja z NarzędziownikiemGP (Supabase)

### 3.1 Droga A – webhook z chmury producenta → Edge Function (najprostsza)

- **Digital Matter Device Manager, konektor HTTP/HTTPS**: Device Manager odbiera dane urządzenia swoim protokołem TCP, przepakowuje je
  na JSON i wysyła **POST** na nasz adres. Serwer ma odpowiedzieć 200/201/202/204. Autoryzacja: Basic, **Bearer** albo klucz per urządzenie;
  do 3 własnych nagłówków; w URL/nagłówkach można wstawić `[SERIAL]`, `[IMEI]`, `[ICCID]`, `[CUSTOM1..3]`:
  <https://support.digitalmatter.com/en_US/integration/the-httphttps-connector> [Z]. Dokładny format JSON jest w dokumentach integracyjnych
  od supportu DM [Z – ta sama strona], więc schemat poznamy dopiero po otwarciu konta [?].
- U nas: jedna **Supabase Edge Function** `tracker-ingest` z sekretem w nagłówku, zapis do tabeli `tracker_positions` i aktualizacja
  „ostatniej pozycji” narzędzia. Bez serwera, bez kolejki, bez aplikacji natywnej.

### 3.2 Droga B – Traccar jako tłumacz protokołów (Teltonika, Mictrack, Queclink)

- Traccar (open source, darmowy do samodzielnego hostingu) rozumie ponad 200 protokołów. Pozycje przekazuje dalej przez `forward.url`
  z `forward.type=json` i nagłówkiem `forward.header` (np. Bearer), z ponawianiem (`forward.retry.enable`, `forward.retry.count`):
  <https://www.traccar.org/forward/> [Z].
- Pozycję z Wi-Fi i stacji bazowej Traccar liczy przez zewnętrznego dostawcę: `geolocation.enable`, `geolocation.type` = google / unwired / opencellid,
  `geolocation.requireWifi`: <https://www.traccar.org/configuration-file/> [Z]. Google Geolocation API: **10 000 zapytań/mies. za darmo**,
  potem 5 USD za 1000: <https://developers.google.com/maps/billing-and-pricing/pricing> [Z]. 200 narzędzi × 4 raporty × 30 dni to 24 000 zapytań,
  ale lookup jest potrzebny tylko wtedy, gdy nie ma GPS [?].
- Traccar trzeba gdzieś uruchomić: mały VPS (koszt [?], rzędu kilkudziesięciu zł miesięcznie) albo hosting Traccar **od 9,95 USD/mies.**
  (konto) / od 49,95 USD/mies. (serwer dedykowany): <https://www.traccar.org/pricing/> [Z]. Limitu urządzeń na koncie strona nie podaje [?].
  Supabase Edge Functions obsługują HTTP, więc surowego TCP od urządzeń nie przyjmą; dlatego potrzebny jest pośrednik [?].
- Alternatywa dla Traccara: **flespi**. Plan darmowy tylko do testów (10 urządzeń); komercyjne **od 130 EUR/mies.**: <https://flespi.com/pricing> [Z].
  Dla 50–200 urządzeń to za drogo.

### 3.3 Droga C – TTN webhook

Dla LoRaWAN TTN wysyła webhook HTTP na nasz adres [W]. Technicznie proste, ale nie rozwiązuje braku zasięgu (rozdz. 2.3).

### 3.4 Gotowe platformy z REST API do odpytywania

Digital Matter ma Device Manager API i Telematics Guru (platforma z abonamentem 1,59–3,79 EUR/mies./szt. wg resellera [Z]). Traccar ma
REST API (`/api/positions`) [?]. **Wolę push (webhook) niż polling**: mniej kodu i od razu świeże dane. Polling ma sens tylko jako zapas.

---

## 4. Koszt całkowity (3 lata)

Założenia: 4 raporty dziennie + raport przy ruchu, ceny netto, EUR po 4,25 zł. Montaż (opaski, uchwyty, klej) i praca: [?], pominięte.
Baterie: przy 4 raportach dziennie żadne z urządzeń A–C nie powinno ich potrzebować w ciągu 3 lat, zgodnie z deklaracjami producentów.

| | **A. Yabby Edge + 1NCE + Device Manager** | **B. Mictrack MT700-NW + 1NCE + Traccar (VPS)** | **C. Teltonika TAT240 + 1NCE + Traccar (VPS)** |
|---|---|---|---|
| Urządzenie | 81,90 EUR ≈ **348 zł** (iot-shop, netto z 97,46 brutto) [Z]; hurt [?] | 109,99 USD ≈ **407 zł** + wysyłka/cło [?] | **390,95 zł** [Z] |
| SIM + 10 lat danych | 13 EUR ≈ **55 zł** [Z] | 55 zł | 55 zł |
| Platforma na urządzenie, 36 mies. | 1,49 EUR × 36 = 53,64 EUR ≈ **228 zł** [Z – reseller] + Location Engine [?] | 0 | 0 |
| Koszty stałe, 36 mies. | forwarding 18,90 EUR × 36 ≈ **2 890 zł**, jeśli dotyczy [?] | VPS ≈ 1 000–1 500 zł [?] + Google po darmowej puli [?] | VPS ≈ 1 000–1 500 zł [?] |
| **20 szt.** | 20 × 631 + 2 890 ≈ **15,5 tys. zł** | 20 × 462 + 1 500 ≈ **10,7 tys. zł** | 20 × 446 + 1 500 ≈ **10,4 tys. zł** |
| **50 szt.** | 50 × 631 + 2 890 ≈ **34,4 tys. zł** | ≈ **24,6 tys. zł** | ≈ **23,8 tys. zł** |
| **200 szt.** | 200 × 631 + 2 890 ≈ **129 tys. zł** | ≈ **94 tys. zł** | ≈ **91 tys. zł** |
| Ryzyka kosztowe | nieznane stawki Location Engine; ceny hurtowe mogą być niższe | nasz serwer do utrzymania; import | brak Wi-Fi; Cat 1 + 2G; realna bateria przy 4 raportach dziennie [?] |

Porównanie z wartością sprzętu: przy 50 szt. wariant A kosztuje ok. 690 zł za narzędzie na 3 lata, czyli ok. 19 zł miesięcznie.
Ma to sens dla sprzętu za kilka tysięcy zł wzwyż (młoty wyburzeniowe, niwelatory, agregaty, zagęszczarki). Na wkrętarkę za 800 zł to się nie opłaca.
**Wariant „GPS tylko na 20–50 najcenniejszych, reszta tylko QR i Ruchy” jest ok. 4–8× tańszy niż 200 szt.** i obejmuje większość wartości
sprzętu poza bazą [?]. Wartości narzędzi zna tylko właściciel, więc listę kandydatów da się wyciągnąć z bazy.

---

## 5. Ograniczenia i ryzyka

- **GPS w budynku, piwnicy, stalowej skrzyni i busie.** GNSS potrzebuje nieba. W metalowej skrzyni narzędziowej i w piwnicy fixa zwykle nie będzie [?].
  W busie z oknami bywa, w blaszaku bez okien słabo [?]. Wtedy:
  - Digital Matter Edge wysyła skan Wi-Fi (baza, biuro, sąsiedzi budowy) i dane stacji. Location Engine liczy pozycję ok. 10–100 m albo 250 m – 1 km [Z].
  - Teltonika bez Wi-Fi: zostaje stacja bazowa (jeśli ją raportuje i mamy dostawcę lookupu) albo „ostatnia znana pozycja” [?].
  - Metalowa skrzynia tłumi też LTE. Raport może nie wyjść wcale; urządzenia buforują dane (DM: do ok. 2 tygodni offline [W – sklep]; Teltonika: 220 000 rekordów [Z]).
- **Bateria: deklaracja a praktyka.** Tabele producentów są liczone przy dobrym zasięgu i w temperaturze pokojowej. Gorzej jest przy słabym
  zasięgu (piwnica, skrzynia), karcie roamingowej (1NCE) [Z – DM], mrozie i trybie „raport przy ruchu” na narzędziu, które jeździ
  codziennie busem [?]. Realnie liczyłbym **połowę deklaracji** [?]: Yabby Edge 3–4 lata przy 4 raportach dziennie, Mictrack 2–3 lata, TAT240 1,5–3 lata.
  Li-SOCl2 (Teltonika) ma pasywację po długim składowaniu [Z – wiki TAT100/TAT240].
- **Wymiana baterii**: Digital Matter i Mictrack to zwykłe AA/AAA lit (Energizer Ultimate Lithium, koszt [?]), wymienia je magazynier
  śrubokrętem. Teltonika ma własny pakiet 7,2 V (osobna część zamienna [W]). Chińskie „4G z magnesem” trzeba ładować co 1–3 mies.
  Aplikacja powinna pokazywać stan baterii i alarm „niski poziom” (DM ma alerty low/critical [Z]).
- **Kradzież.** Widoczny lokalizator złodziej zerwie w minutę; ukryty daje szansę na odzysk. Yabby (85 g, 84×63×24 mm) da się wkleić lub
  przykręcić w obudowę agregatu, skrzyni czy pod pokrywę zagęszczarki. Na elektronarzędzia ręczne (wkrętarka, szlifierka) jest za duży,
  sensowny montaż to walizka/skrzynia, a wtedy lokalizator pilnuje walizki, a nie narzędzia [?]. Tryb „recovery” (częstsze raporty po kradzieży)
  mają Digital Matter i Mictrack [Z].
- **Mocowanie**: drabiny i rusztowania: opaski stalowe/nitonakrętki, IP68 wystarczy. Agregaty i zagęszczarki: temperatura przy silniku [?],
  montaż z dala od wydechu. Magnes (TAT240, MT700) jest wygodny, ale ułatwia kradzież.
- **RODO (krótko).** Lokalizator jest na narzędziu, nie na człowieku, ale gdy narzędzie nosi jeden pracownik albo wozi je jeden bus, pozycja
  pośrednio pokazuje, gdzie był pracownik. Minimalizacja: raporty co kilka godzin zamiast śledzenia trasy, zapis dopasowanej **Lokalizacji**
  zamiast śladu, krótka retencja surowych pozycji, **bez urządzeń z mikrofonem** (TK905B „voice monitoring” [Z]). Pracowników trzeba
  poinformować w regulaminie. Jeśli firma świadomie używa tego do kontroli pracowników, wchodzi art. 22³ Kodeksu pracy (szczegóły
  w [przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md), rozdz. 1.5) [?]. Mimo to ryzyko jest dużo mniejsze niż przy telefonach pracowników.
- **Dostępność i dostawca.** Obie strony iot-shop.de z Digital Matter pokazują „Not Available For Sale” [Z], a TAT141 jest EOL [Z].
  Przed zakupem 50+ szt. trzeba potwierdzić dostępność i ceny u dystrybutora. Ryzyko uzależnienia: przy Digital Matter działamy na ich chmurze i cenniku.

---

## 6. Rekomendacja

1. **Pierwszy wybór: Digital Matter Yabby Edge Cellular** (albo Oyster Edge na duże maszyny).
   Jako jedyny z badanych spełnia wszystkie założenia naraz: LTE-M, zwykłe baterie AAA na lata, Wi-Fi w budynku, IP68/IK, mały, a dane
   przychodzą **HTTPS-em prosto do Supabase** bez naszego serwera. Minusy: abonament DM (ok. 1,49 EUR/mies.), nieznane stawki
   Location Engine, ceny i dostępność tylko przez dystrybutora.
2. **Drugi wybór (bez abonamentu, taniej): Mictrack MT700-NW** + 1NCE + Traccar na małym VPS. Wersja z Wi-Fi i bateriami AA.
   Minusy: 290 g, import z Chin, własny serwer do utrzymania (mały, ale jednak infrastruktura).
3. **Nie rekomenduję**: Teltonika TAT100 (2G), TAT141 (EOL), TAT240 jako głównego (brak Wi-Fi, Cat 1; dobry, jeśli liczy się zakup
   od ręki w Polsce i narzędzia stoją głównie pod chmurką), chińskich „4G z magnesem” (akumulator, mikrofon, zamknięta platforma),
   LoRaWAN i Sigfox (brak sieci na budowach).

### Wdrożenie krok po kroku (wariant Digital Matter)

1. **Wybór narzędzi**: właściciel oznacza 20–50 najcenniejszych (lista z bazy po wartości).
2. **Pilotaż 5 szt.** (Yabby Edge + 5 kart 1NCE): po jednym na agregacie, zagęszczarce, niwelatorze w skrzyni, drabinie i w busie.
   2–4 tygodnie. Mierzymy: ile raportów ma GPS, ile tylko Wi-Fi albo stację, zużycie danych na 1NCE, spadek baterii, czy dopasowanie do budowy działa.
3. **Konto Digital Matter Device Manager** przez dystrybutora; wymuszenie LTE-M (1NCE w Polsce nie ma NB-IoT [Z]); profil: raport co 6 h
   w spoczynku + raport przy starcie i końcu ruchu; Location Engine włączony.
4. **Konektor HTTPS** w Device Manager → `https://<projekt>.supabase.co/functions/v1/tracker-ingest`, nagłówek `Authorization: Bearer <sekret>`,
   w URL `[SERIAL]`.
5. **Supabase**: tabela `trackers` (serial/IMEI ↔ narzędzie, firma), tabela `tracker_positions` (czas, lat/lon, dokładność, źródło GNSS/Wi-Fi/cell,
   bateria), Edge Function zapisuje pozycję i liczy **dopasowaną Lokalizację**: baza albo budowa, jeśli punkt leży w promieniu np. 150–300 m
   od jej współrzędnych (adres budowy trzeba raz zgeokodować) [?]. Pojazd: jeśli na busie też jest lokalizator, narzędzie, które jedzie w tym
   samym czasie i miejscu co bus, oznaczamy jako „prawdopodobnie w pojeździe X”. Bez lokalizatora w busie wystarczy stan „w drodze”.
6. **Ruchy zostają ręczne.** Historia ruchów tylko się dopisuje i rejestruje ją człowiek (CONTEXT.md), więc lokalizator **nie tworzy Ruchów**.
   Pokazuje tylko osobną informację i **alarm rozbieżności**: „wg ewidencji na budowie Kwiatowa 5, lokalizator od 2 dni widzi bazę”. Kierownik
   jednym kliknięciem rejestruje wtedy Ruch zgodny z lokalizatorem.
7. **Skalowanie** do 50 szt. po pilotażu, jeśli bateria i dopasowanie się sprawdzą.

### Co zobaczy użytkownik na karcie Narzędzia

- Kafelek **„Lokalizator”**: *„Ostatnio widziany: Budowa Kwiatowa 5 · 2 godz. temu · GPS ±15 m”* albo *„okolice bazy · wczoraj 18:10 · Wi-Fi ±60 m”*,
  albo *„brak sygnału od 3 dni (ostatnio: Bus WX 12345)”*.
- Mała mapka z punktem i kółkiem dokładności (bez trasy).
- **Bateria**: „ok. 80%” i ostrzeżenie „wymień baterie (3×AAA)” przy niskim stanie.
- **Znaczek rozbieżności**, gdy lokalizator i ewidencja się nie zgadzają, z przyciskiem „Zarejestruj ruch tutaj” (dla kierownika i magazyniera).
- W Wyszukiwaniu przy wyniku: „wg lokalizatora: baza, 1 godz. temu”, obok lokalizacji z ewidencji.

---

## 7. Pytania otwarte

- Rzeczywiste ceny hurtowe Yabby Edge / Oyster Edge u dystrybutora w PL/UE i stawki Location Engine (per urządzenie, per lookup) [?].
- Czy 1NCE w Polsce jest w roamingu u jednego operatora (którego?) i jak to wpływa na baterię i zasięg LTE-M w piwnicach [?].
- Zużycie danych na sesję (czy 500 MB 1NCE wystarczy na 10 lat przy 4 raportach dziennie) [?], do zmierzenia w pilotażu.
- Czy Traccar dekoduje TAT240 bez zmian (ten sam kodek co TAT140) [?].
- Stan Helium i Semtech LoRa Cloud w 2026 (dla kompletności; nie zmienia rekomendacji) [?].

## 8. Źródła

- Digital Matter: <https://www.digitalmatter.com/devices/yabby-edge-cellular/>, <https://www.digitalmatter.com/devices/yabby3/>,
  <https://www.digitalmatter.com/devices/oyster3/>, <https://support.digitalmatter.com/battery-life-estimates-[yabby-edge-cellular]>,
  <https://support.digitalmatter.com/battery-life-estimates-[oyster-edge]>, <https://support.digitalmatter.com/en_US/reports-device-manager/device-manager-billing>,
  <https://support.digitalmatter.com/location-engine-billing>, <https://support.digitalmatter.com/en_US/integration/direct-to-3rd-party-server-integration-considerations>,
  <https://support.digitalmatter.com/en_US/integration/the-httphttps-connector>, <https://support.digitalmatter.com/en_US/Yabby-Edge-Cellular-getting-started/introducing-the-yabby-edge-cellular>
- Sklepy: <https://iot-shop.de/en/shop/dim-yabby-edge-4g-digital-matter-yabby-edge-cellular-tracker-7561>, <https://iot-shop.de/en/shop/dim-yabby3-4g-digital-matter-yabby3-tracker-7297>,
  <https://www.alliot.co.uk/product/Digital-Matter-Yabby-Edge-4G-LTE-M-NB-IoT-Tracker/64837000004622622>, <https://www.wisp.pl/p11884,teltonika-tat240.html>,
  <https://iot-shop.de/en/shop/mok-lw001-bg-pro-mokosmart-lw001-bg-pro-lorawan-gps-tracker-6611>, <https://www.seeedstudio.com/SenseCAP-Card-Tracker-T1000-A-p-5697.html>
- Mictrack: <https://shop.mictrack.com/product/cat-m1-nb-iot-asset-gps-tracker-mt700/>, <https://www.mictrack.com/product/cat-m1-nb-iot-asset-gps-tracker/>, <https://www.mictrack.com/products/>
- Teltonika: <https://wiki.teltonika-gps.com/view/TAT240_General_description>, <https://wiki.teltonika-gps.com/view/TAT240_Battery_Discharge_Characteristics>,
  <https://wiki.teltonika-gps.com/view/TAT141_General_description>, <https://www.teltonika-gps.com/products/trackers/assets-workforce/tat141>,
  <https://wiki.teltonika-gps.com/view/TAT100_General_description>, <https://wiki.teltonika-gps.com/view/TAT140>
- Winnes: <https://www.winnes.com/products/4g-gps-tracker-strong-magnetic-10000mah-battery-ip65-waterproof-real-time-tracking-devices-gps-locator-with-free-app-pc-platform-car-tracker-devices-anti-lost-for-motorcycle-truck-boat-tk905b>
- Łączność: <https://www.1nce.com/en-eu/1nce-connect/pricing>, <https://a.storyblok.com/f/335000/x/8f7999b185/1nce-coverage-en.pdf>,
  <https://orange-m2m.pl/lte-m.html>, <https://orange-m2m.pl/tt10.html>, <https://www.thethingsnetwork.org/docs/lorawan/duty-cycle/>,
  <https://www.sigfox.com/coverage/>, <https://www.imsig.pl/krs/0000679746>, <https://www.orange.pl/poradnik-dla-firm/iot/sieci-lorawan/>
- Integracja: <https://www.traccar.org/devices/>, <https://www.traccar.org/forward/>, <https://www.traccar.org/configuration-file/>,
  <https://www.traccar.org/pricing/>, <https://flespi.com/pricing>, <https://developers.google.com/maps/billing-and-pricing/pricing>
- Wtórne [W]: 2G/3G w Polsce – <https://spidersweb.pl/2026/05/t-mobile-siec-2g-wylaczenie-termin-data.html>, <https://www.tabletowo.pl/kiedy-t-mobile-wylaczy-2g-w-polsce-termin/>;
  LoRaWAN w PL – <https://www.elmark.com.pl/blog/lorawan-od-podstaw-zastosowania-zasieg-integracja-i-opacalnosc-wdrozenia->;
  TAT100 Allegro – <https://allegro.pl/produkt/lokalizator-gps-teltonika-tat100-mienia-maszyny-budowlane-kontenery-etc-637b0ad0-549a-414d-9dd1-5e48273d38da>
