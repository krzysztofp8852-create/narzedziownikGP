# Tanie trackery (GT06 / Concox / Jimi / Sinotrack): czy da się zejść poniżej ~150 zł

Data badania: **2026-09-29**. Ceny z tego dnia, w walucie źródła; przeliczenia orientacyjne jak w poprzednim researchu
(1 USD ≈ 3,7 zł, 1 EUR ≈ 4,25 zł; kursów dnia nie sprawdzałem). Dokument uzupełnia [tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md)
(Digital Matter, Mictrack, Teltonika, 1NCE, Traccar/flespi, LoRaWAN): tamtych wniosków nie powtarzam. Pojęcia wg [CONTEXT.md](../../CONTEXT.md).

Oznaczenia: **[Z]** zweryfikowane u źródła (strona producenta, dokumentacja, kod, forum, cennik), **[W]** tylko wyniki wyszukiwarki
albo prasa/strony wtórne, **[?]** niezweryfikowane lub moja inferencja. Allegro, Amazon, AliExpress i część stron Jimi IoT zwracały
403/429/przekierowania, więc **ceny polskie z Allegro nie są zweryfikowane** [?].

---

## 0. Podsumowanie

1. **Nie znalazłem tracker-a, który spełnia naraz: < 150 zł, sieć przetrwająca do 2029+ (LTE-M/Cat 1) i sensowna bateria (miesiące–lata).**
   Segment „tanich” dzieli się na dwie grupy: (a) **2G bez przyszłości** (klasyczne GT06/GT06N, Micodus MV720/MV730 to 2G [W]), często poniżej 150 zł,
   ale T-Mobile zapowiada gradualne ograniczanie 2G od 1.01.2028, a Orange planuje wygaszenie do 2030 [W]; (b) **4G z dużym akumulatorem 10 000 mAh**
   (Jimi LL01/LL301, Sinotrack ST-915L), realnie **ok. 180–520 zł** za sztukę [W].
2. **Jimi IoT (dawniej Concox) JM-LL01** to najciekawszy „tani” kandydat: LTE Cat M1/NB2 + fallback 2G, akumulator 10 000 mAh, deklarowane **do 3 lat**
   w trybie oszczędzania, GPS+BDS+LBS+Wi-Fi, IP65, 297 g, magnes, w specyfikacji CE/FCC [Z – jimiiot.us]. Mówi protokołem **GT06/Concox**,
   który Traccar obsługuje na porcie **5023** [Z]. Cena: ok. 141 USD na eBay [W], hurt nieznany [?]. To ok. **520 zł**, a nie < 150 zł.
3. **Jimi LL301** (Cat 1 + 2G, ten sam akumulator) i **Sinotrack ST-915L** są tańsze (ok. 316 zł promocyjnie na AliExpress [W]; hurt Alibaba 46–49 USD ≈ 170–181 zł [W]),
   ale deklarowana żywotność to **tygodnie–miesiące** (LL301: 40 dni w trybie śledzenia, 2 lata tylko w power-saving [W]; ST-915L: 120 dni wg producenta,
   w innych opisach 30 dni albo 2 tygodnie [W]) i mają **mikrofon** („voice monitoring” [W]) – ryzyko RODO.
4. **Integracja bez własnego VPS-a w sensie „serwera aplikacyjnego” jest możliwa, ale surowe TCP trzeba gdzieś odebrać.** Cloudflare Workers nie przyjmuje
   przychodzącego TCP [Z], Supabase Edge Functions też mówią tylko HTTP [?]. Najtańsza sensowna droga: **mały serwer Node z biblioteką `gt06` (ISC) na Fly.io
   (dedykowany IPv4 2 USD/mies. jest konieczny dla surowego TCP [Z])**, ok. **4–5 USD/mies. (15–19 zł)**, który zapisuje pozycje do Supabase HTTPS-em.
5. **Karty SIM są najmniejszym problemem**: 1NCE 12 EUR + 1 EUR za kartę na 10 lat (LTE-M w PL potwierdzone, poprzedni research), Orange IoT na kartę 5 zł/31 dni za 0,5 GB [Z].
6. **Odpowiedź (rozdz. 7): poniżej ~150 zł z sensowną baterią i siecią, która przetrwa – nie, na podstawie tego, co dało się zweryfikować.** Realny dół to ok. 300 zł
   (LL301) z baterią na miesiące, albo ok. 500 zł (LL01) z baterią na lata. Warto zrobić pilotaż 5 szt. (rozdz. 8), zanim ktokolwiek policzy 200 sztuk.

### Tabela porównawcza (ceny na 2026-09-29)

| Model | Sieć | Bateria / deklarowana żywotność | Rozmiar / waga / IP | Pozycja w budynku | Mikrofon | Protokół → Traccar | Cena sztuki |
|---|---|---|---|---|---|---|---|
| **Jimi JM-LL01** | LTE Cat M1/NB2 (B1/2/3/4/5/8/12/13/18/19/20/26/28/66) + fallback EGPRS [Z] | 10 000 mAh Li-Pol; **do 3 lat** w power-saving, zależnie od częstości raportów [Z]; tryby: standby / tracking / power-saving [Z] | 109×61×30,5 mm, **297 g**, IP65, magnes, −20…+70 °C [Z] | GPS+BDS+LBS+**Wi-Fi** [Z – manual]; strona produktu wspomina tylko GPS+LBS [Z] | nie wymieniony [Z] | GT06/Concox, port 5023 [Z] | ~**141 USD (≈520 zł)** eBay [W]; hurt [?] |
| **Jimi LL301** | LTE Cat 1 + 2G [W] | 10 000 mAh; **7 dni – 2 lata**, do 40 dni w trybie tracking [W] | ~IP65, magnes [W] | GPS+BDS+LBS+Wi-Fi [W] | **tak** („voice monitoring”) [W] | GT06, port 5023 (użytkownik forum Traccar) [Z] | **85,5 USD (≈316 zł)** AliExpress, promocja −55% [W] |
| **Sinotrack ST-915L** | LTE Cat 1 + 2G (strona producenta); w innych opisach Cat M1/NB-IoT/EGPRS [Z/W, sprzeczne] | 10 000 mAh; „120 dni standby” [Z – producent]; 30 dni / 2 tygodnie w innych opisach [W] | wg producenta 100×80×25 mm, „45 g” (sprzeczne z 10 Ah) [Z], IP65, magnes | tylko GPS/LBS [?] | **tak** („voice monitor”) [W] | własny protokół Sinotrack (flespi) [Z]; w Traccar `h02`/`jt808` dla rodziny ST-9xx [?] | Alibaba hurt **46–49 USD (≈170–181 zł)** [W]; Allegro [?] |
| **Mictrack MT700** (dla porównania) | LTE-M/NB-IoT + 2G [Z] | 3×AA do 7 lat / akumulator 7800 mAh do 3 lat [Z]; użytkownik forum: 1 raport/dzień + deep sleep: „718 dni, 67% baterii” (test w toku) [Z – forum] | 290 g, IP68 | Wi-Fi tylko -W/-NW [Z] | brak | `tlt2h`/`mictrack` [Z] | 79,99–109,99 USD [Z] |
| **Klasyczne GT06 / GT06N (2G)** | **tylko 2G** [W] | wired albo mały akumulator [W] | – | LBS | zwykle podsłuch [W] | `gt06`, port 5023 [Z] | Allegro < 150 zł [?] (nie zweryfikowane) |
| **Micodus MV720/MV730** | **2G** [W] | zasilanie 9–40 V, nie bateryjny [W] | – | – | – | protokół TQ (nie GT06) [W] | [?] |

Wniosek z tabeli: prawdziwie tanie (< 150 zł) urządzenia są albo 2G, albo przewodowe (do aut), albo z zamkniętą platformą; **żaden bateryjny model 4G nie zszedł poniżej ok. 170 zł nawet w hurcie**.

---

## 1. Urządzenia: szczegóły

### 1.1 Jimi IoT JM-LL01 (najlepszy kandydat z tej grupy)

- Specyfikacja z jimiiot.us: LTE Cat M1/NB2 z fallbackiem EGPRS, akumulator **10 000 mAh / 3,7 V**, „do 3 lat w power-saving” (zależnie od częstości raportów),
  109×61×30,5 mm, 297 g, IP65, −20…+70 °C, magnes, alarm zdjęcia (czujnik światła), 3-osiowy akcelerometr, konfiguracja przez Bluetooth,
  certyfikaty FCC, CE, PTCRB, AT&T, TELEC: <https://www.jimiiot.us/products/jm-ll01-asset-gnss-tracker.html> [Z].
- Instrukcja (manuals.plus): pozycjonowanie GPS+BDS+LBS+**Wi-Fi**, dokładność < 2,5 m: <https://manuals.plus/jimi%20iot/jm-ll01-lte-cat-m1-and-nb2-asset-gnss-tracker-manual-2> [Z].
  Tabela „raporty/dzień → czas pracy” nie była dostępna (PDF i strony Jimi zwracały 403/429), stąd żywotność przy 1–4 raportach dziennie
  **poza deklaracją „do 3 lat” jest [?]**. Powtarzana w wielu miejscach fraza „3 lata przy jednym raporcie dziennie” pochodzi z materiałów producenta [W].
- **Ważne z forum Traccar**: użytkownicy LL01/LL301 nie mogli zmusić urządzenia do przerwania częstych „check-inów” na postoju; rada: heartbeat co 10 min
  (`HBT,10#`) i konfiguracja trybów, np. `Mode,1,30,3600#`, `Movemode,off,...`, `Stopmode,on,60,...`, `staticrep,on,180,6,3#`:
  <https://www.traccar.org/forums/topic/jimiconcox-lm-ll01/> [Z]. Domyślna konfiguracja może więc zużywać baterię wielokrotnie szybciej niż deklaracja;
  dokładne znaczenie parametrów [?].
- **Mocowanie**: magnes (sprzęt stalowy – tak; aluminium, plastik, drewno – nie), 297 g i 109 mm to za dużo na wkrętarkę, ale OK na agregat, zagęszczarkę,
  skrzynię, drabinę stalową. Klej/opaski wymagają własnych uchwytów [?].
- **Pozycja w budynku**: Wi-Fi + LBS. Traccar liczy pozycję z LBS/Wi-Fi tylko przez zewnętrznego dostawcę geolokalizacji (Google/Unwired/OpenCellID) [Z – poprzedni research].
- **Wyłączenie ciągłego raportowania**: tak, tryb power-saving / ruchowy istnieje [Z – producent], ale wymaga ostrożnej konfiguracji (patrz wyżej).

### 1.2 Jimi LL301 i Sinotrack ST-915L (tańsze, gorsza bateria, mikrofon)

- **LL301**: Cat 1 + 2G, 10 000 mAh, GPS+BDS+LBS+Wi-Fi, „7 dni do 2 lat”, w trybie tracking do 40 dni; AliExpress 85,5 USD (promocja −55%) [W]:
  <https://www.jimilab.com/products/jm-ll301-4g-lte-cat-asset-gnss-tracker.html>, <https://www.aliexpress.com/item/1005003077173526.html>.
  Cat 1 zużywa więcej energii niż LTE-M [?], stąd skrócony realny czas. Ma „voice monitoring” [W] – **odpada ze względów RODO**, chyba że da się fizycznie wyłączyć (nie ustaliłem [?]).
- **Sinotrack ST-915L**: strona producenta podaje „GSM/LTE Cat 1”, 10 000 mAh, „120 dni standby”, 5 m dokładności, darmową aplikację i platformę na zawsze; wymiary/waga
  („45 g”) są niespójne z akumulatorem 10 Ah, więc dane strony traktuję z rezerwą:
  <https://www.sinotrackgps.com/product-sinotrack-st-915l-waterproof-magnet-10000mah-120-days-standby-vehicle-4g-gps-tracker-for-australia> [Z].
  Opisy sprzedawców wymieniają „LTE Cat M1, NB-IoT, EGPRS” i tryby: praca ciągła 2–3 dni, „przy ruchu” ok. tydzień, standby ok. 2 tygodnie [W] –
  **czyli ładowanie co 1–4 tygodnie**, jeśli te opisy są prawdziwe. Hurt: 46–49 USD/szt. (Alibaba) [W].
- Sinotrack ma **własny protokół** (flespi: „sinotrack protocol”, zarządzany przez Auto Leaders) [Z: <https://flespi.com/devices/sinotrack-st-915>]. Czy Traccar go dekoduje – [?].
  Domyślna droga to zamknięta platforma SinoTrackPro, więc do Supabase potrzebny byłby własny odbiornik protokołu, który nie ma gotowej biblioteki [?].

### 1.3 Tanie „GT06” w klasycznym sensie (2G, do aut)

- GT06/GT06N to lokalizatory samochodowe (2G, zasilanie z instalacji, wibracja budzi ze snu, komendy SMS): Allegro ma wiele ofert „GT06 odcięcie paliwa, podsłuch, SOS” [W]. Ceny [?].
  **Nie nadają się**: 2G, przewód zasilający, mikrofon. Protokół jest jednak tym samym „GT06”, co w LL01/LL301, więc jeden odbiornik obsłużyłby oba.
- Micodus MV720/MV730 to 2G (i protokół TQ, nie GT06) [W]. ML935 (obroża dla psa, 3000 mAh) – za mała bateria [W].
- Concox AT4: 10 000 mAh, magnes, mikrofon, wersje 2G i 4G [W]. Cena nieustalona [?].

### 1.4 Tryby oszczędzania i „sleep on vibration”

- Rodzina GT06 buduje „wibracyjne budzenie” na akcelerometrze: alarm/wybudzenie po ruchu [W]. Dla 1–4 raportów dziennie potrzebny jest tryb, w którym modem śpi (PSM/eDRX)
  i budzi się tylko na harmonogram albo ruch. Producent deklaruje to dla LL01 („power-saving”) [Z], ale **nie mam niezależnego potwierdzenia**.
- Jedyny znaleziony „prawdziwy” pomiar dotyczy Mictrack MT700: użytkownik forum Traccar podaje **718 dni z 67% baterii** przy 1 raporcie/dzień i deep sleep w detekcji wibracji
  (test w toku), a w trybie „always on” ok. 2 tygodnie: <https://www.traccar.org/forums/topic/tracker-with-battery-for-car/page/2/> [Z – wpis użytkownika, nie test niezależnego laboratorium].
  Ten sam wątek: SinoTrack ST-904L (1200 mAh) w „Always ON” – ok. 16 godzin [Z – wpis użytkownika]. Wniosek: **bez trybu głębokiego uśpienia nawet 10 Ah wystarcza na tygodnie**.

---

## 2. Protokół GT06 i integracja

### 2.1 Protokół i Traccar

- Nagłówki pakietów `0x78 0x78` lub `0x79 0x79`, standardowy port 5023, konfiguracja SMS-em: `SERVER,1,host,5023,0#` (tryb 1 = domena, 0 = IP), `APN,nazwa#`, `TIMER,30,60#`:
  <https://traxelio.com/trackers/protocol/gt06> [Z – strona wtórna] oraz <https://www.iconcox.com/news/the-latest-gt06n-manual-you-should-have.html> [W]. Dla LL01/LL301 część
  parametrów (tryby, HBT) ma inne komendy niż stary GT06N (patrz 1.1) [Z].
- **Traccar**: protokół `gt06`, **port 5023** [Z: <https://www.traccar.org/devices/>]. Dekoder `Gt06ProtocolDecoder.java` w `github.com/traccar/traccar` obsługuje ponad 70 typów wiadomości:
  login (IMEI), heartbeat/status (napięcie baterii, siła sygnału), pozycje GPS i GPS+LBS, pakiet **Wi-Fi** (MSG_WIFI), alarmy (SOS, wibracja, niski poziom baterii, zdjęcie), LBS (MCC/MNC/LAC/CID)
  i dane baterii; jest też kodowanie komend do urządzenia [Z: <https://raw.githubusercontent.com/traccar/traccar/master/src/main/java/org/traccar/protocol/Gt06ProtocolDecoder.java>].
  Na liście Traccar są m.in. „Concox GT06N”, „Concox GT07”, „Jimi IoT JM01”, „JM08” [Z]. **Czy Traccar wymienia z nazwy LL01/LL301** – użytkownicy forum twierdzą, że działa na `gt06`/5023 [Z – forum], oficjalna pozycja na liście [?].
- **flespi** ma osobny protokół „Concox” dla JM-LL01 [Z: <https://flespi.com/devices/jimi-iot-concox-jm-ll01>], ale plan komercyjny od 130 EUR/mies. odpada (poprzedni research).

### 2.2 Najprostsze doprowadzenie danych do Supabase

Surowe TCP nie może wejść do Supabase bezpośrednio:

- **Cloudflare Workers**: obsługują tylko **wychodzące** TCP (`connect()`); „nie da się nawiązać przychodzącego połączenia TCP do Workera” [Z: <https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/>]. Odpada jako odbiornik.
- **Supabase Edge Functions**: tylko HTTP [?].
- **Fly.io**: surowe TCP na porcie innym niż 80/443 bez TLS wymaga **dedykowanego IPv4, 2 USD/mies.** [Z: <https://docs.fly.io/networking/services/>, <https://docs.fly.io/about/pricing/>].
  Na współdzielonym IPv4 działa tylko z handlerem TLS, którego trackery GT06 nie robią [Z]. Compute shared-cpu: 0,00000075 USD za vCPU-sekundę (≈1,9 USD/mies. przy pełnym etacie), RAM 0,00000193 USD za GB-sekundę
  (≈5 USD/GB/mies.), ruch przychodzący gratis [Z]. Moja kalkulacja: Node 256 MB + IPv4 ≈ **4–5 USD/mies. (15–19 zł)** [?, obliczone z cennika].
- **Hetzner Cloud** (najmniejsze CX23: 2 vCPU/4 GB): ceny w wynikach sprzecznie 3,99–5,99 EUR/mies. po korektach 2026, we wrześniu 2026 „niedostępny” w niektórych lokalizacjach [W]. Szacunek: **4–6 EUR/mies. (17–26 zł)** [W].
- **Traccar Docker** na Fly/Hetzner: potrzebuje więcej RAM (Java) [?], ok. 1 GB → ≈9 USD/mies. na Fly [?, obliczone]. Hosting Traccar: **od 9,95 USD/mies.** (konto współdzielone), 49,95 USD (dedykowany) [Z: <https://www.traccar.org/pricing/>];
  limit urządzeń i możliwość forwardingu do Supabase [?].
- **Railway**: model użycia (20 USD/vCPU, 10 USD/GB RAM/mies.) [W]; obsługa raw TCP i jej koszt [?].

### 2.3 Własny odbiornik GT06 w Node (nakład pracy)

- Gotowe biblioteki npm: **`gt06`** (vondraussen/gt06, licencja **ISC** wg rejestru npm, v1.0.12, ostatnia publikacja 21.02.2024, 42 gwiazdki, 1 otwarty issue, CRC16 i automatyczne odpowiedzi
  dla login/heartbeat, przykład z `net.createServer` w README) [Z: <https://github.com/vondraussen/gt06>, rejestr npm];
  **`gt06-parser`** (licencja **MIT**, v1.1.1, zmodyfikowana 12.01.2026, login/lokalizacja/status/alarm, CRC16, LBS) [Z: rejestr npm]; `protocol-gps-gt06` (Node 18+) i `gps-tracking` [W].
  Repozytorium `vondraussen/gt06` nie ma pliku licencji w API GitHub [Z] – ważna jest licencja ISC z pakietu npm.
- Zakres: ok. **1–3 dni pracy** [?]: serwer TCP, ramkowanie i ack (biblioteka), mapowanie IMEI → Narzędzie, zapis do Supabase przez RPC/PostgREST z kluczem serwisowym, dopasowanie do **Lokalizacji**,
  obsługa LBS/Wi-Fi przez zewnętrznego dostawcę geolokalizacji (Google Geolocation API: 10 000 zapytań/mies. gratis, potem 5 USD/1000 [Z – poprzedni research]), reconnect i monitoring procesu.
  **Nie wiem, czy LL01/LL301 mają dodatkowe pakiety (np. Wi-Fi, energia), których biblioteka nie zna – to trzeba sprawdzić na prawdziwym urządzeniu** [?]. Traccar ma je opisane w dekoderze (MSG_WIFI itd.) [Z].
- Alternatywnie: Traccar przekazuje pozycje przez `forward.url`/JSON do Edge Function [Z – poprzedni research], co zmniejsza nakład kodu (zero dekodera), ale zwiększa koszt serwera (Java).

---

## 3. Łączność

- **1NCE**: 12 EUR za 10 lat, 500 MB, 250 SMS, karta 1–2,50 EUR [Z – poprzedni research]. Polska: 2G/3G/4G/LTE-M tak, NB-IoT nie [Z – poprzedni research]. Wymuszenie LTE-M (albo Cat 1) w urządzeniu jest konieczne. **APN 1NCE (`iot.1nce.net`)
  i działanie na LL01/LL301/ST-915L nie zostały potwierdzone u źródła** [?]. 1NCE obejmuje 250 SMS, więc komendy SMS (`SERVER,...`) da się wysłać.
- **Truphone (netowo.com)**: 139 zł za kartę na 5 lat i 500 MB, 2G/3G/4G/LTE-M, APN `iot.truphone.com`, **bez SMS** (komend SMS nie wyślemy) [Z: <https://netowo.com/karta-telemetryczna-m2m-5-lat-500-mb>]. Za droga przy 200 sztukach.
- **Orange IoT na kartę**: opłata 20 zł, pakiety 0,5 GB/5 zł na 31 dni, 2 GB/7 zł, 5 GB/12 zł, każde doładowanie przedłuża ważność konta o rok, minimum 30 zł na start, APN `iot` [Z: <https://www.orange.pl/view/iot-na-karte>].
  Czy da się utrzymać kartę bez płacenia 5 zł miesięcznie, czy LTE-M jest w tej taryfie – [?].
- **Things Mobile**: multi-operatorowa karta IoT (2G/3G/4G/Cat-1/Cat-M1), rozliczenie za zużycie od ok. 0,10 EUR/MB, bez opłat stałych [W]. Przy 10 MB/mies. ≈ 1 EUR/mies. ≈ 36 EUR/3 lata ≈ 150 zł. Prawdziwy koszt zależy od cennika [?].
- **Simmotrade**: 4,80 EUR za 50 MB [W]. Karty z Amazon.pl drogie na skalę 200 sztuk.
- **Koszt danych na 3 lata na urządzenie (4 raporty dziennie)**: 1NCE ≈ **55 zł** [Z], Things Mobile ≈ 150 zł [W], Truphone 139 zł/5 lat [Z]. **1NCE wygrywa**, o ile działa z wybranym urządzeniem.
- Zużycie danych: GT06 wysyła kilkadziesiąt bajtów na pakiet, ale sam heartbeat co kilka minut zjada dane; użytkownicy forum piszą o ok. 30 MB/mies. dla ST-915L [W]. Przy 500 MB i 30 MB/mies. karta 1NCE starcza na niecałe 17 miesięcy,
  dlatego **tryb oszczędzania i heartbeat 10 min są też kwestią limitu danych** [obliczone].

---

## 4. Recenzje i żywotność baterii: co jest rzetelne

- **Niezależnych testów LL01/LL301/ST-915L w rzetelnych źródłach nie znalazłem** [?]. Wyniki wyszukiwarki to opisy producentów i sprzedawców (eBay, AliExpress, Alibaba, Amazon), bez opinii użytkowników w wyciągniętych fragmentach.
- Co jest: wpisy użytkowników forum Traccar: MT700 7800 mAh – 2 tygodnie w „always on”, ale 718 dni z 67% w deep sleep 1 raport/dzień (test trwający) [Z – wpis]; ST-904L – 16 h; SenseCAP T1000A traci 10% w 5 dni przy raporcie co 5 min [Z – wpis].
  Trzeba pamiętać, że to pojedyncze posty [Z: <https://www.traccar.org/forums/topic/tracker-with-battery-for-car/page/2/>].
- Wątek LL01/LL301: **ciągłe check-iny na postoju** obniżają żywotność, trzeba ręcznie ustawić heartbeat i tryby [Z: <https://www.traccar.org/forums/topic/jimiconcox-lm-ll01/>].
- Deklaracje „120 dni / 1 rok / 3 lata” rozjeżdżają się nawet w opisach tego samego urządzenia (ST-915L: 120 dni, 30 dni, 2 tygodnie [W]; Winnes TK905B 80 dni czuwania [Z – poprzedni research]).
  **Zakładam, że deklaracje „do X” dotyczą trybu głębokiego uśpienia przy jednym raporcie dziennie w dobrym zasięgu.** Realna żywotność przy 4 raportach i słabym zasięgu: połowa deklaracji lub mniej [?].
- Ładowanie: LL01/LL301/ST-915L są ładowane USB/ładowarką 5 V [Z – producent Sinotrack: 5 V/1 A]; **akumulator wbudowany, wymiana wymaga serwisu** [?], w przeciwieństwie do AA/AAA w Digital Matter i Mictrack.
- Ryzyko jakości: platformy chińskie (Sinotrack, Winnes) są zamknięte; wsparcia w PL brak [?]; certyfikaty: LL01 podaje CE na stronie producenta [Z], Sinotrack i AliExpress/Alibaba [?].

---

## 5. Całkowity koszt dla 200 / 50 / 20 narzędzi na 3 lata

Założenia: ceny netto, urządzenie + SIM (1NCE 13 EUR ≈ 55 zł) + serwer TCP (Fly.io ≈ 17 zł/mies. × 36 ≈ 610 zł, jeden na całość). Bez cła, wysyłki, uchwytów i pracy [?].
**Ceny urządzeń są z jednej oferty detalicznej albo hurtowej z wyszukiwarki [W]; dla LL01 hurtu nie znam – realna oferta od dystrybutora/producenta może być niższa.** Ceny LL301 to promocja AliExpress.

| Wariant | Urządzenie | Urządzenie + SIM | 20 szt. | 50 szt. | 200 szt. | Uwagi |
|---|---|---|---|---|---|---|
| **A. Jimi LL01** | ~520 zł (141 USD eBay) [W] | ~575 zł | **~12,1 tys. zł** | **~29,4 tys. zł** | **~115,6 tys. zł** | bateria do 3 lat (deklaracja), LTE-M, brak mikrofonu w opisie |
| **B. Jimi LL301** | ~316 zł (85,5 USD, promocja) [W] | ~371 zł | ~8,0 tys. zł | ~19,2 tys. zł | ~74,8 tys. zł | bateria: tygodnie–miesiące, mikrofon |
| **C. Sinotrack ST-915L** | ~181 zł (49 USD hurt Alibaba) [W] | ~236 zł | ~5,3 tys. zł | ~12,4 tys. zł | ~47,8 tys. zł | Sinotrack protokół (brak gotowca), ładowanie co 1–4 tyg., mikrofon |
| *odniesienie: Mictrack MT700-NW* (poprzedni research) | ~407 zł | ~462 zł | ~10,7 tys. zł | ~24,6 tys. zł | ~94 tys. zł | AA lit, deep sleep 718 dni (post) |
| *odniesienie: Yabby Edge* (poprzedni research) | ~348 zł | ~631 zł | ~15,5 tys. zł | ~34,4 tys. zł | ~129 tys. zł | AAA, Wi-Fi, webhook |

Wnioski:
- Żaden wariant nie mieści się w 150 zł za sztukę **z zasilaniem i siecią na 3 lata**. LL01 kosztuje w detalu ~4× więcej niż cel; hurt może zbliżyć do ~250–350 zł [?].
- Wariant C wygląda najtaniej, ale nie ma sensu operacyjnie: 200 sztuk ładowanych co miesiąc to 2400 ładowań w 3 lata. Przy 20–50 sztukach ładowanie bywa jeszcze akceptowalne, gdy narzędzia i tak wracają na bazę [?].
- **Wariant 20–50 sztuk** kosztuje ~8–29 tys. zł i wystarczy do sprawdzenia biznesowego sensu; skala 200 sztuk (≥ 75 tys. zł) ma sens, jeśli LL01 potwierdzi ok. 2–3 lata na baterii i znajdzie się hurt.
- Koszt serwera jest znikomy (~610 zł / 3 lata), więc **decyduje cena urządzenia**.

---

## 6. Ryzyka

- **Wygaszanie sieci w Polsce** (prasa, wszystkie [W]; nie znalazłem komunikatów operatorów u źródła):
  - **3G**: T-Mobile wyłączył do końca kwietnia 2023; **Orange zakończył w listopadzie 2025** (ok. 0,5% nadajników jeszcze działa); Play wygasza etapami od 2025, koniec do końca 2027;
    **Plus zaczyna w grudniu 2026**, koniec w 2027. Źródła: <https://technologia.dziennik.pl/aktualnosci/artykuly/11244706,kiedy-zniknie-stara-siec-w-polsce-sprawdzamy-plany-t-mobile-orange-play-i-plus.html> (10.05.2026),
    <https://tvn24.pl/biznes/z-kraju/koniec-3g-w-polsce-orange-t-mobile-plus-nju-terminy-wylaczen-st7990752> (04.07.2024).
  - **2G**: T-Mobile gwarantuje do 31.12.2027, od 1.01.2028 może gradualnie ograniczać; Orange do 2030; Play i Plus bez oficjalnych dat, nieoficjalnie Plus może wyłączyć 2G i 3G niemal jednocześnie [W].
  - Konsekwencja: **urządzenia tylko 2G odpadają** (3-letni cykl kończy się w 2029). LL01 (LTE-M + 2G) i LL301 (Cat 1 + 2G) mają 2G tylko jako zapas. Zasięg LTE-M Orange: 99,8% populacji [Z – poprzedni research].
    Cat 1 opiera się na zwykłym LTE, którego terminu wygaszenia w PL nie znam [?].
- **Jakość i zgodność**: od **1.08.2025** obowiązują wymogi cyberbezpieczeństwa RED (EN 18031) dla urządzeń radiowych z dostępem do internetu, bez okresu przejściowego [W: <https://www.btv-technologies.com/en/magazine/en-18031-explained-the-cybersecurity-standard-that-already-applies>].
  Trackery GPS są w zakresie [W]. Czy Jimi/Sinotrack mają aktualną deklarację zgodności z EN 18031 – [?]. Strona LL01 podaje CE [Z], ale to nie dowód RED-DA. Przy imporcie z Chin przez AliExpress/Alibaba importerem jest firma, więc ryzyko zgodności spada na nią [?].
- **Bateria w praktyce budowlanej**: wibracje, praca w pobliżu silnika, mróz (< −10 °C spada pojemność Li-Pol [?]), piwnice (słaby zasięg wydłuża rejestrację w sieci i zużywa energię). Niezależnych testów w takich warunkach brak [?].
- **RODO (krótko)**: mikrofony/„voice monitoring” (LL301, ST-915L, AT4, Winnes) – **wykluczyć** (kontrola pracowników, nagrywanie rozmów bez podstawy). LL01 nie ma mikrofonu w opisie [Z]. Lokalizator na narzędziu pośrednio wskazuje pracownika:
  minimalizacja (raporty co kilka godzin, brak trasy), zapis dopasowanej Lokalizacji, krótka retencja surowych pozycji i informacja w regulaminie. Szczegóły w [przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md) [?].
- **Zależność od jednego producenta i chińskiej platformy**: przy własnym odbiorniku GT06 dane nie przechodzą przez chmurę Jimi, o ile urządzenie da się przekierować SMS-em/Bluetooth [Z – komenda `SERVER`], ale Jimi Tracksolid domyślnie kieruje na własny serwer (`gpsdev.tracksolid.com` w przykładzie) [W].

---

## 7. Odpowiedź: czy da się zejść poniżej ~150 zł

**Nie, jeśli wymagamy naraz sensownej baterii i sieci, która przetrwa 3 lata.** Na podstawie zweryfikowanych i wyszukiwarkowych danych:

1. **< 150 zł** kosztują tylko urządzenia **2G** lub przewodowe (klasyczne GT06 i Micodus) [W, ceny Allegro [?]]. 2G w Polsce zaczyna gasnąć w 2028 (T-Mobile) i do 2030 (Orange) [W], czyli w połowie cyklu życia.
2. **Najtańsze 4G z dużym akumulatorem** (Sinotrack ST-915L, Jimi LL301) to **ok. 180–320 zł**, ale z baterią na tygodnie–miesiące, mikrofonem i (Sinotrack) zamkniętą platformą.
3. **Jedyny w tej grupie z deklaracją bateryjną na lata i LTE-M: Jimi JM-LL01**, ok. **520 zł w detalu** [W], hurt nieznany. To około 3,5× cel 150 zł i cena zbliżona do Mictrack MT700 (~407 zł), który ma **lepiej udokumentowaną baterię** (wymienne AA, test 718 dni) i jest w Traccar.
4. Realny „dół” za sensowną baterię i sieć to więc **ok. 300–500 zł za sztukę**, a nie < 150 zł. Jeśli budżet na sztukę jest twardo 150 zł, jedynym rozwiązaniem jest **ładowalny tracker 4G + ładowanie cykliczne + lokalizator tylko na najcenniejszych narzędziach (20–50 szt.)**.

---

## 8. Rekomendacja pilotażu (5 szt.)

Cel: sprawdzić w praktyce, czy deklaracje Jimi mają pokrycie, zanim ktoś zamówi więcej. Ten sam protokół (GT06) → jeden odbiornik.

1. **3 × Jimi JM-LL01** (LTE-M, brak mikrofonu, deklarowane do 3 lat) + karty 1NCE. Zamówić przez dystrybutora/Jimi, prosząc o wycenę hurtową na 20/50/200 szt. i **potwierdzenie deklaracji zgodności RED-DA (EN 18031)** oraz tabelę czasu pracy dla 1, 2, 4, 12 raportów dziennie.
2. **2 × Mictrack MT700-NW** jako punkt odniesienia (AA lit, Wi-Fi, udokumentowany deep sleep, protokół Traccar) – zamiast LL301/ST-915L z mikrofonem. Jeśli budżet pilotażu musi być najniższy: 1 × ST-915L i 1 × LL301 tylko jako test bateryjny, z wyłączonym/nieużywanym mikrofonem (o ile w ogóle legalny w firmie) [?].
3. **Odbiornik**: mały serwer Node z `gt06` (ISC) na Fly.io z dedykowanym IPv4 (~4–5 USD/mies.), zapis do Supabase; na pilotaż można też uruchomić Traccar lokalnie/Docker [?].
4. **Konfiguracja przed wyjściem**: `SERVER,1,<host>,5023,0#` (SMS przez kartę z SMS albo Bluetooth), heartbeat `HBT,10#`, tryby wg wątku forum; zmierzyć w 4 tygodnie: spadek baterii na dobę, liczba raportów z GPS vs LBS/Wi-Fi, zużycie danych na 1NCE, zachowanie w skrzyni metalowej i w busie.
5. **Kryterium sukcesu**: spadek baterii ≤ 1%/tydzień przy 2 raportach dziennie (→ ≥ 2 lata), pozycja w budowie w ≥ 80% raportów, koszt hurtowy LL01 ≤ 300 zł. Jeśli nie spełnione – zostać przy najcenniejszych 20 szt. z Digital Matter lub Mictrack.

---

## 9. Pytania otwarte

- Hurtowa cena LL01 (20/50/200 szt.) i polski dystrybutor; wsparcie w PL [?].
- Tabela żywotności LL01 (raporty/dzień) i zachowanie w power-saving w praktyce; niezależny test [?].
- Czy Traccar ma LL01/LL301 na liście oficjalnie; czy ma wszystkie pakiety (Wi-Fi) [?].
- Ceny Allegro/Amazon dla wszystkich modeli (strony zwracały 403) [?].
- Działanie 1NCE z LL01 (APN, LTE-M) i minimalne zamówienie [?].
- Zgodność z RED-DA dla Jimi/Sinotrack; oficjalne komunikaty operatorów o 2G [?].

## 10. Źródła

- Jimi: <https://www.jimiiot.us/products/jm-ll01-asset-gnss-tracker.html>, <https://manuals.plus/jimi%20iot/jm-ll01-lte-cat-m1-and-nb2-asset-gnss-tracker-manual-2>,
  <https://www.jimilab.com/products/jm-ll301-4g-lte-cat-asset-gnss-tracker.html>, <https://www.aliexpress.com/item/1005003077173526.html>, <https://www.ebay.de/itm/376410599412>
- Sinotrack: <https://www.sinotrackgps.com/product-sinotrack-st-915l-waterproof-magnet-10000mah-120-days-standby-vehicle-4g-gps-tracker-for-australia>, <https://flespi.com/devices/sinotrack-st-915>,
  <https://www.alibaba.com/product-detail/SinoTrack-ST-915L-Wireless-Waterproof-GPS_1600906419339.html>
- Traccar i protokół: <https://www.traccar.org/devices/>, <https://raw.githubusercontent.com/traccar/traccar/master/src/main/java/org/traccar/protocol/Gt06ProtocolDecoder.java>,
  <https://www.traccar.org/forums/topic/jimiconcox-lm-ll01/>, <https://www.traccar.org/forums/topic/tracker-with-battery-for-car/page/2/>, <https://traxelio.com/trackers/protocol/gt06>,
  <https://flespi.com/devices/jimi-iot-concox-jm-ll01>, <https://www.traccar.org/pricing/>
- Biblioteki: <https://github.com/vondraussen/gt06>, <https://www.npmjs.com/package/gt06>, <https://www.npmjs.com/package/gt06-parser>
- Infrastruktura: <https://docs.fly.io/about/pricing/>, <https://docs.fly.io/networking/services/>, <https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/>, <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/>
- SIM: <https://netowo.com/karta-telemetryczna-m2m-5-lat-500-mb>, <https://www.orange.pl/view/iot-na-karte>, <https://www.thingsmobile.com/the-best-iot-sim-card-in-the-world/the-best-iot-sim-card-for-poland>
- Sieci [W]: <https://technologia.dziennik.pl/aktualnosci/artykuly/11244706,kiedy-zniknie-stara-siec-w-polsce-sprawdzamy-plany-t-mobile-orange-play-i-plus.html>,
  <https://tvn24.pl/biznes/z-kraju/koniec-3g-w-polsce-orange-t-mobile-plus-nju-terminy-wylaczen-st7990752>
- RED [W]: <https://www.btv-technologies.com/en/magazine/en-18031-explained-the-cybersecurity-standard-that-already-applies>
