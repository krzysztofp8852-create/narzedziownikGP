# Tagi BLE na narzędzia: wybór sprzętu i wdrożenie u klienta krok po kroku

Data badania: **2026-10-01**. Ceny sprawdzone tego dnia, w walucie źródła; ceny z wcześniejszych researchów mają ich datę (2026-09-29).
Przeliczenia są orientacyjne, z tym samym założeniem co wcześniej (1 EUR ≈ 4,25 zł, 1 USD ≈ 3,7 zł; kursów dnia nie sprawdzałem).

Dokument zamyka wątek BLE z [nadajniki-ble-nawigacja-do-narzedzi.md](nadajniki-ble-nawigacja-do-narzedzi.md) (rynek tagów, protokoły,
Web Bluetooth, baterie) i [przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md) (bramki strefowe, bramki w pojazdach,
telefony pracowników, RODO). Alternatywy bez własnej infrastruktury są w [google-find-hub-tagi-i-dostep.md](google-find-hub-tagi-i-dostep.md)
i [tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md). Tamtych ustaleń nie powtarzam, tylko do nich odsyłam. Nowe są tu dwie rzeczy:
**konkretny wybór** (tag + odbiorniki + droga danych) i **instrukcja wdrożenia** u firmy budowlanej.

Oznaczenia jak wcześniej: **[Z]** zweryfikowane u źródła (strona producenta, wiki, karta katalogowa, sklep, kod), **[W]** tylko z wyników
wyszukiwarki, streszczenia strony albo źródła wtórnego, **[?]** niezweryfikowane albo moja inferencja. Niczego nie kupowałem, nie logowałem się
i nie wysyłałem formularzy.

Pojęcia domenowe wg [CONTEXT.md](../../CONTEXT.md): **Firma**, **Narzędzie**, **Kod**, **Lokalizacja** (baza, budowa, serwis, pojazd), **Ruch**,
**Dzwonek**, **Zgłoszenie**. Nowe słowa w tym dokumencie (**tag**, **odbiornik**, **sygnał**) to propozycje, nie terminy z CONTEXT.md.

Stan aplikacji, na którym opieram część o integracji: dane są w Supabase Postgres (schemat `app`, region eu-west-1, ADR
[0001](../adr/0001-supabase-w-irlandii.md)), tabele `app.locations` (rodzaj: baza, budowa, serwis, pojazd) i `app.tools` (`code`, `location_id`,
`located_since`) w `supabase/migrations/`. Serwer to Next.js 16 na Vercel (`fra1`), zadania harmonogramu to Route Handlers w `src/app/zadania/*`
z własnym sprawdzaniem sekretu (`src/lib/cron.ts`). Katalogu `supabase/functions` nie ma, więc wcześniejsze propozycje „Supabase Edge Function”
zamieniam tu na Route Handler w Next.js. Efekt jest ten sam, a nie dochodzi nowe środowisko.

---

## 0. Podsumowanie

1. **Tag główny: Teltonika EYE Beacon (BTSID1)**, **87,70 zł netto** (WISP.PL, dostępny) [Z]. IP67 i **IK10** (jedyny kandydat
   z deklarowaną udarnością na poziomie IK10), CR2450 600 mAh, niewymienna, **4+ lata przy 3 s** i 2 dBm, −20…+60 °C, 56,6×38×13 mm, 18–19 g,
   dwa otwory na śruby lub opaskę [Z]. Nadaje **iBeacon + protokół EYE z napięciem baterii i flagą „niski stan baterii”** naraz [Z].
   Odbiorniki Teltoniki w busach dekodują to bez dodatkowej pracy. Do tego dochodzi dostępność u kilku polskich dystrybutorów.
2. **Tańsza alternatywa: MikroTik TG-BT5-OUT**, **51,15 zł netto** (WISP.PL, dostępny) [Z]. Zalany w formie, **IP69K**, 550 mAh,
   **5–15 lat przy 1 s / 5 s** (w formacie MikroTik), −20…+85 °C, śruby M3 lub opaska, 38×32×16 mm [Z – karta katalogowa]. Na papierze bateria i zakres
   temperatur są lepsze niż w EYE. Słabsze strony: brak deklaracji IK, procent baterii widać tylko w formacie MikroTik, a nie wiem, czy tag nadaje
   kilka formatów naraz [?]. Najlepiej pasuje, jeśli wszystkie odbiorniki to MikroTik KNOT.
3. **Odbiorniki**:
   - **busy**: Teltonika FMC920 (182,04 zł netto, dostępny) albo FMC130 (198,73 zł netto) [Z – lista WISP.PL] z funkcją **Beacon List**:
     do 100 widocznych beaconów, filtr po UUID, rekord „On Change” [Z]. Status EOL tych modeli jest niejasny (rozdz. 1.4) [?];
   - **kontenery na budowach i baza**: **MikroTik KNOT** (290,30 zł netto, dostępny) [Z]. Ma BLE 5.2, LTE‑M/NB‑IoT, Wi‑Fi, 2× Ethernet,
     listę do 1024 ogłoszeń, a skrypt RouterOS wysyła **HTTPS POST prosto do naszej aplikacji**, bez pośrednika [Z].
4. **Droga danych**: Teltonika mówi tylko protokołem Codec 8 Extended po TCP/UDP [Z]. Vercel przyjmuje **tylko HTTP** [Z], więc busy idą przez
   **pośrednika**: Traccar na małym VPS-ie (`forward.type=json`, dekoduje UUID/major/minor/RSSI i baterię beaconów [Z – kod]) albo flespi
   (strumień HTTP z JSON-em [Z]; plan darmowy tylko do testów i 10 urządzeń, komercyjny od 130 EUR/mies. [Z]). KNOT-y wysyłają
   HTTPS bezpośrednio. Wszystko trafia do jednego Route Handlera, który zapisuje **ostatni sygnał** taga. **Ruchu** nie tworzy.
5. **Koszt dla przykładowej firmy** (150 narzędzi, 5 busów, 1 baza, 3 budowy; rozdz. 4): sprzęt, materiały i montaż w busach ok. **19–20 tys. zł netto** z tagami EYE
   albo ok. **13–14 tys. zł netto** z tagami MikroTik. Do tego nasza robocizna (ok. 4–5 roboczodni) oraz kilkadziesiąt zł miesięcznie
   (VPS, SIM). Dla porównania GPS na każdym narzędziu wychodził ok. 130 tys. zł na 3 lata dla 200 szt. ([tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md)).
6. **Najważniejsze ryzyka**: tag w **zamkniętej stalowej skrzyni** (szuflady w busie, Jobox) może nie być słyszalny. Teltonika podaje
   „10–15 m” niezawodnego zasięgu w metalowych naczepach [Z]. Do tego dochodzą zimne noce poniżej −20 °C w busie oraz niewymienne baterie, czyli
   wymiana całych tagów po 3–4 latach. Wszystko to sprawdza się w testach odbiorczych (rozdz. 2, krok 11), zanim klient kupi tagi na cały park.

### Tabela wyboru

| Rola | Wybór | Cena netto (2026-10-01) | Dlaczego | Zastępstwo |
|---|---|---|---|---|
| Tag (główny) | Teltonika EYE Beacon BTSID1 | 87,70 zł (WISP.PL) [Z] | IK10, IP67, bateria w ogłoszeniu, natywnie w Teltonice | EYE Sensor BTSMP1 (te same wymiary, 2,5+ roku przy 3 s) [Z] |
| Tag (tańszy) | MikroTik TG-BT5-OUT | 51,15 zł (WISP.PL) [Z] | IP69K, 5 lat przy 1 s, −20…+85 °C | Minew E9 (10 USD, IP67, wymienna 1000 mAh, 18 mies.) [Z], import z Chin |
| Odbiornik w busie | Teltonika FMC920 / FMC130 | 182,04 / 198,73 zł [Z] | Beacon List, zasilanie 10–30 V, uśpienie z wybudzaniem na skan | MikroTik KNOT na 12 V (rozdz. 1.4) |
| Bramka w kontenerze | MikroTik KNOT | 290,30 zł [Z] | LTE‑M + HTTPS bez pośrednika, 1024 ogłoszenia | Minew MG6 (99 USD, LTE Cat 1 EU, HTTP/MQTT) [Z]; FMC920 na zasilaczu 12 V |
| Bramka w bazie | MikroTik KNOT (1–2 szt.) | 290,30 zł/szt. [Z] | Ethernet/Wi‑Fi, bez limitu 100 beaconów | Minew MG3 (19 USD, Wi‑Fi) – poprzedni research |
| Pośrednik dla busów | Traccar na VPS | VPS [?], Traccar open source | forward JSON, dekoduje beacony | flespi (130 EUR/mies. przy wielu klientach) [Z] |

---

## 1. Który tag i które odbiorniki

### 1.1 Kryteria dla małych narzędzi budowlanych

Wiertarki, szlifierki, poziomice i lasery spadają z rusztowań, leżą w błocie, jeżdżą w skrzyniach z innym żelastwem i stoją zimą w nieogrzewanym busie.
Z tego wynikają kryteria (kolejność to moja ocena ważności):

1. **Odporność**: IP67 lub więcej, deklarowana udarność (IK), zakres pracy co najmniej od −20 °C.
2. **Mocowanie**: płaska podstawa i otwory na śruby lub opaskę. Mocowanie na samą taśmę odpada przy elektronarzędziach.
3. **Bateria przy krótkim interwale**: 2–3 s wystarcza bramkom (skan trwa ok. 30 s, poniżej), 1 s przydaje się do trybu „cieplej/zimniej”
   z poprzedniego researchu. Ważna jest żywotność przy tych interwałach, a nie przy domyślnych 5–10 s.
4. **Bateria w ogłoszeniu** (telemetria): bez niej o rozładowaniu dowiadujemy się dopiero wtedy, gdy narzędzie „znika”.
5. **Zgodność z odbiornikami**: iBeacon albo Eddystone, które Teltonika parsuje sama (tryb Simple) [Z].
6. **Dostępność i serwis w PL/UE**: zakup od ręki na fakturę, bez importu z Chin dla 150 szt.
7. **Ochrona konfiguracji**: PIN albo hasło, które da się zmienić.

### 1.2 Kandydaci zweryfikowani w tym researchu

Wcześniejsze modele (MTB09, E8, Feasycom, Holyiot, TG-BT5-IN, RuuviTag, Blue Charm, Kontakt.io) są w tabeli
[nadajniki-ble-nawigacja-do-narzedzi.md, rozdz. 1](nadajniki-ble-nawigacja-do-narzedzi.md). Tu tylko nowe dane.

| Model | IP / IK | Bateria | Żywotność wg producenta | Temp. pracy | Wymiary / masa | Mocowanie | Telemetria baterii | Cena (2026-10-01) |
|---|---|---|---|---|---|---|---|---|
| **Teltonika EYE Beacon BTSID1** | IP67 / **IK10** [Z] | CR2450 600 mAh, niewymienna [Z] | 4+ lata @3 s; 8+ lat @5 s (domyślnie); 10+ lat @10 s; Tx 2 dBm [Z] | −20…+60 °C [Z] | 56,6×38×13 mm, 18–19 g [Z] | 2 otwory: śruby, opaska, smycz; taśma [Z] | napięcie (mV) + flaga „low battery” w protokole EYE [Z] | **87,70 zł netto / 107,87 brutto** WISP.PL, dostępny [Z]; Allegro 144,90 zł, PanGPS 109 zł, 2it.pl 116,88 netto [W] |
| **Teltonika EYE Sensor BTSMP1** | IP67 / IK10 [Z] | jw. [Z] | 2,5+ roku @3 s; 4+ lata @5 s; 5+ lat @10 s [Z] | −20…+60 °C [Z] | 56,6×38×13 mm, 18 g [Z] | jw. [Z] | jw. + temperatura, wilgotność, ruch [Z] | nie sprawdzałem [?] |
| **MikroTik TG-BT5-OUT** | **IP69K**, zalany [Z]; IK – brak deklaracji | 550 mAh LiMnO2, wbudowana [Z] | **5–15 lat @1 s/5 s** (format MikroTik) [Z – karta] | **−20…+85 °C** [Z] | 38×32×16 mm, 27 g [Z] | opaska, **śruby M3** [Z] | % baterii w formacie MikroTik (`mtik-battery`) [Z]; Eddystone‑TLM [Z] | **51,15 zł netto / 62,91 brutto** WISP.PL, dostępny [Z]; MSRP 18 USD [Z] |
| **Minew E9** | IP67 [Z] | 1000 mAh, **wymienna** [Z] | „18 months” (bez podanego interwału) [Z] | [?] | 25 g [Z] | śruby [Z] | Eddystone‑TLM [Z] | **10 USD** (≈ 37 zł) minewstore, wysyłka kurierem z Chin [Z] |
| **Kontakt.io Asset Tag 2** | IP67 [W] | 2× ER14250, 2400 mAh, niewymienne [W] | do 8 lat przy ustawieniach fabrycznych [W] | [?] | 49×49×15 mm, 39 g [W] | taśma, opaska; **bez śrub** [W] | [?] | brak ceny publicznej (por. poprzedni research) |
| **MOKO M2 / M8 / M9** | M2 IP67; M8/M9 IP67/IK06 [W] | M2: CR2477 wymienna [W] | M8/M9 3–5 lat [W] | [?] | M2 70×46×21 mm [W] | śruby, naklejka [W] | [?] | Alibaba [W]; strony MOKO zwracały 403 |
| Hilti AI T320 (odniesienie) | IP67 [Z] | [?] | 4 lata @23 °C, nadaje co 7 s [Z] | −20…+60 °C [Z] | 32×22×5 mm [Z] | taśma, adapter na opaskę, drut, uchwyty metalowe [Z] | system zamknięty | „from £250.00” (opakowanie, cena po zalogowaniu) [Z] |
| Milwaukee Tick (odniesienie) | IP67, IK08 [W] | CR2032, **wymienna** [Z/W] | „over 1 year” [Z] | −29…+60 °C [W] | [?] | „glue, screw, rivet or strap” [Z] | alert w aplikacji One-Key [Z] | system zamknięty |
| Bosch TrackTag (odniesienie) | IP67 [W] | CR2032 [W] | do 3 lat [W] | [?] | ok. 34×32×13 mm, 18 g [W] | **żywica epoksydowa dwuskładnikowa** w zestawie [W] | system zamknięty | – |

Wnioski z modeli „markowych” (Hilti, Milwaukee, Bosch): wszystkie mają IP67, mały i płaski kształt, interwał rzędu kilku sekund, a mocowanie
**epoksyd albo śruby/nity**, taśma tylko jako opcja. Na tym opieram instrukcję montażu w kroku 6.

### 1.3 Rekomendacja i uzasadnienie

**Główny: Teltonika EYE Beacon BTSID1.** Teltonika wygrywa nie parametrami, tylko tym, że spina całe wdrożenie:

- **IK10** to jedyna twarda deklaracja udarności wśród otwartych tagów, które sprawdziłem [Z]. Na budowie najczęstszą awarią
  będzie upadek, nie woda.
- **Bateria w ogłoszeniu.** Tryb „iBeacon + EYE Sensor” nadaje razem identyfikator iBeacon i napięcie baterii (`2000 + VALUE × 10` mV),
  a bit 6 flag oznacza niski stan baterii [Z]. Odbiornik Teltoniki przesyła to w AVL 385 [Z], a Traccar dekoduje `beaconNBattery` [Z – kod].
  Dzięki temu alarm „wymień tag” dostajemy bez własnego dekodera.
- **Jeden producent tagów i odbiorników w busach**, polska dystrybucja (WISP.PL, Batna24, PanGPS, Multimapa) i wersja ATEX dla klientów
  ze strefami zagrożenia wybuchem [Z/W].
- Kształt z dwoma otworami pasuje do śrub, opaski i kleju.

Słabe strony EYE: bateria jest niewymienna, więc po 3–4 latach wymienia się cały tag [Z]. Żywotność producent podaje tylko dla 3, 5 i 10 s.
Przy 1 s danych nie ma, a ekstrapolacja z 3 s daje rzędu 1,5–2 lat (moja inferencja, nie źródło) [?]. Skok z „4+ lata @3 s” do „8+ lat @5 s”
wygląda na nieliniowy i może być zawyżony [?]. Aplikacja EYE na iOS nie pokazuje tagów w trybie iBeacon, więc konfiguracja wymaga telefonu z Androidem [Z].

**Tańszy: MikroTik TG-BT5-OUT.** Kosztuje 51,15 zł zamiast 87,70 zł, czyli ok. 5,5 tys. zł oszczędności na 150 tagach. Ma lepszą szczelność
(IP69K), bardziej odporną na upał elektronikę (do 85 °C, ważne latem za szybą busa) i według karty 5 lat przy 1 s [Z]. Biorę go jako
alternatywę, a nie jako główny, bo:
- nie ma deklaracji IK, choć zalanie w formie dobrze rokuje [?];
- żywotność 5–15 lat podano „w formacie MikroTik”. Teltonika w busie potrzebuje iBeacon albo Eddystone (tryb Simple) [Z], a w trybie iBeacon
  baterii w ogłoszeniu nie ma. Dokumentacja Beacon Managera nie mówi jasno, czy tag nadaje kilka formatów naraz [?]. Obejście: tryb Advanced
  w Teltonice z ID = MAC i ręcznym wycięciem bajtów baterii z danych producenta [Z – opis trybu], ale tego nie testowałem [?];
- **zabezpieczenie zapisu hasłem jest nieodwracalne** („there is no way to remove password protection”) [Z]. Utrata hasła oznacza tag,
  którego nie da się już przekonfigurować.

Jeśli klient chce **samych MikroTików** (KNOT także w busach), TG-BT5-OUT staje się wyborem głównym: KNOT czyta format MikroTik z baterią
i temperaturą natywnie [Z], a pośrednik dla busów odpada.

**Odrzucone teraz:** Minew E9 (10 USD) ma wymienną baterię i IP67, ale bez deklarowanej temperatury, z niejasnym interwałem żywotności i z importem
z Chin. Zostaje jako opcja „ultratania” do pilotażu [Z/?]. Kontakt.io Asset Tag 2 nie ma mocowania na śruby i nie ma cennika [W].
MOKO: strony producenta niedostępne (403), dane tylko z Alibaba [W].

### 1.4 Odbiorniki

**Pojazd (bus brygady): Teltonika FMC z Beacon List.**
- Beacon List: tryby *Disabled / All / Configured*, „All visible beacons are detected. (Max. 100)”, lista skonfigurowana do 50 ID od FW 3.27.07,
  filtr częściowy (np. `UUID::Minor`, `Namespace:`), rekord „On Change” albo okresowy (domyślnie 60 s), tryb Simple (AVL 385) albo Advanced (AVL 548),
  w trybie Advanced ID może być adresem MAC [Z – wiki FMC150/FMC920/FMC130 Beacon List].
- AVL 385 ma zmienną długość, więc trzeba włączyć **Codec 8 Extended** [Z – „How to start with FMB devices and Beacons”].
- Uśpienie z wyłączonym zapłonem: parametr „Bluetooth On While In Sleep” i „Periodic Wakeup … for beacon collection” (od FW 03.28) [Z – wiki FMB003;
  dla FMC920 zakładam to samo [?]]. Dzięki temu bus na noc może co godzinę sprawdzić, co w nim leży, bez rozładowania akumulatora.
- Serwer zapasowy w trybie **Duplicate** wysyła dane do dwóch serwerów naraz [Z]. To ważne, jeśli klient ma już Teltonikę od dostawcy GPS
  flotowego: można dołożyć nasz serwer, nie wymieniając urządzenia (wymaga zgody dostawcy i dostępu do konfiguracji [?]).
- Ceny WISP.PL 2026-10-01: **FMC920 182,04 zł netto** (dostępny), **FMC130 198,73 zł netto** (dostępny), FTC921 191,21 zł netto [Z].
  FMC150 336,96 zł netto, chwilowo brak [Z]. Unikać FMB920/FMB130 (tylko 2G, wygaszanie od 2028 r. – por. [tanie-trackery-gt06.md](tanie-trackery-gt06.md)).
- **Status EOL jest niejasny.** Strony produktów FMC920, FMC130 i FMC150 na teltonika-gps.com pokazują oznaczenie „End of life” bez dat,
  ale oficjalna lista EOL tych modeli nie wymienia, a FMC130 występuje tam jako *zamiennik* innych urządzeń [W – streszczenia stron]. Dla FTC921
  (następca w linii FT) nie znalazłem strony Beacon List w wiki (404) [?]. **Przed zakupem trzeba zapytać dystrybutora o aktualny model z Beacon List.**
- Zasilanie FMC: 10–30 V DC z zabezpieczeniem przed odwrotną polaryzacją [Z – FMC150]. Montuje go instalator GPS (koszt [?]).

**Kontener na budowie i baza: MikroTik KNOT.**
- BT 5.2, LTE‑M/NB‑IoT (modem BG77, nano SIM), GPS, Wi‑Fi 2,4 GHz, 2× Ethernet, zasilanie microUSB 5 V, DC 12–57 V, PoE‑in; maks. 18 W;
  −40…+70 °C; IP20; w zestawie zasilacz 24 V 1,2 A i uchwyty ścienny i DIN [Z]. Złącza SMA dla LTE i GPS. Producent nie wymienia anten
  w zestawie, więc trzeba je doliczyć [Z/?].
- Skaner RouterOS: `/iot bluetooth scanners advertisements`, lista do 1024 wpisów, filtry po adresie, danych (regex), RSSI [Z].
  Wysyłka: `/tool fetch http-method=post http-header-field=... http-data=...` po HTTPS [Z] albo MQTT [Z].
- BG77 nie utrzymuje połączenia LTE‑M i nie łapie GPS jednocześnie, więc skrypt wyłącza PPP na ok. 32 s [Z]. W kontenerze GPS jest zbędny,
  bo kontener stoi na budowie o znanym adresie.
- Cena: **290,30 zł netto / 357,07 zł brutto**, dostępny (WISP.PL) [Z]. W wyszukiwarce pojawiła się też cena 275,18 zł netto [W].

**Odrzucone lub zapasowe bramki stałe:**
- **Teltonika RUTX10/11/12/14** obsługują EYE od FW RUTX_R_00.07.02.0 i wysyłają dane przez HTTP(S)/MQTT [Z], ale każdy tag trzeba **sparować
  osobno** w interfejsie routera [Z – przykład konfiguracji]. Przy 150 tagach to nie ma sensu. Ceny nie sprawdzałem [?].
- **Minew MG6**: Wi‑Fi, Ethernet, **LTE Cat 1 z pasmami UE** (B1/3/5/7/8/20/28), MQTT/HTTP/TCP, filtry RSSI/MAC, ok. 400 pakietów/s, DC 12 V lub PoE,
  −20…+50 °C, „indoor only”; **99 USD** (≈ 366 zł) w minewstore [Z]. Dobry zamiennik KNOT-a w kontenerze, jeśli zabraknie KNOT-ów, ale to import.
- **Ruuvi Gateway**: 199 EUR netto, Wi‑Fi/Ethernet, bez LTE, HTTP i MQTT [Z]. Za drogi i bez LTE na budowę.
- **Teltonika FMC920 w kontenerze** na zasilaczu 12 V: ta sama droga danych co busy i GNSS potwierdza, gdzie stoi kontener. Wadą jest limit
  100 beaconów i wewnętrzne anteny w stalowym kontenerze [?]. To rozsądny wybór, jeśli klient chce jednego producenta odbiorników.

### 1.5 Droga danych (schemat)

```
[tag EYE] --BLE--> [FMC w busie] --TCP, Codec 8E--> [Traccar na VPS albo flespi] --HTTPS POST JSON--> [Route Handler na Vercel] --> Postgres (Supabase)
[tag EYE] --BLE--> [KNOT w kontenerze/bazie] --------------------------------------HTTPS POST JSON--> [ten sam Route Handler]
```

- Vercel: „HTTP only: The container must open an HTTP server” [Z], więc surowego TCP od Teltoniki nie przyjmiemy. To potwierdza wniosek z
  [tanie-lokalizatory-gps.md, rozdz. 3.2](tanie-lokalizatory-gps.md).
- **Traccar**: `forward.url`, `forward.type=json`, `forward.header` (np. Bearer), ponawianie (`forward.retry.enable`, domyślnie 10 prób,
  kolejka do 100 pozycji) [Z]. Beacony przychodzą jako atrybuty pozycji busa: `beaconNUuid`, `beaconNMajor`, `beaconNMinor`, `beaconNRssi`,
  `beaconNBattery`, `beaconNTemp`. W trybie Advanced (AVL 548) są to `tagNId`, `tagNRssi`, `tagNVoltage`, `tagNLowBattery`, `tagNMac` [Z – kod
  `TeltonikaProtocolDecoder.java`].
- **flespi**: kanał Teltonika parsuje AVL 385 do `ble.beacons` (lista `{id, rssi}`) [W]. Strumień HTTP wysyła POST z tablicą JSON wiadomości,
  z własnymi nagłówkami, partiami (`limit_messages`) i dopiero po potwierdzeniu poprzedniej partii [W – baza wiedzy flespi]. Jest też osobny
  kanał „ble-beacons”, który robi z każdego beacona osobne urządzenie [W]. Cennik: Free 10 urządzeń „for testing & development”, Start
  **130 EUR/mies.** z 1000 urządzeń, potem 0,02 EUR/urządzenie [Z]. Dla jednego klienta za drogo, ale przy wielu firmach koszt się rozkłada.
  Czy flespi przekazuje baterię EYE z AVL 385: [?].
- **Teltonika FOTA WEB** (zdalna konfiguracja i aktualizacje): według wyników wyszukiwania darmowa dla klientów Teltoniki, konto zakłada dystrybutor [W].
  Strona zwróciła 503. Danych telemetrycznych FOTA WEB nie przekazuje, więc nie zastępuje pośrednika [?].
- **KNOT → HTTPS bezpośrednio**: skrypt co 60–300 s czyta ogłoszenia z filtrem na UUID Firmy i wysyła JSON z nagłówkiem `Authorization: Bearer <token odbiornika>` [Z – składnia fetch].

---

## 2. Wdrożenie u klienta krok po kroku

Przykład: firma ze 150 narzędziami, 5 busami, 1 bazą i 3 budowami. Czas podany przy krokach to moje szacunki [?].

### Krok 1. Rozmowa przedsprzedażowa i wizja lokalna (½–1 dnia)

**Rozmowa z Właścicielem:**
- Jaki problem rozwiązujemy: „ginie sprzęt” (potrzebny sygnał „wyjechało i nie wróciło”), „nie wiadomo, w którym busie” albo „szukamy na budowie”.
  Od odpowiedzi zależy, gdzie stawiamy odbiorniki.
- Czy busy mają już GPS flotowy i od kogo (Teltonika z trybem Duplicate, rozdz. 1.4, czy inny producent).
- Czy budowy mają kontener z prądem i jak długo trwają. Krótkie budowy (2–3 tygodnie) nie uzasadniają stałej bramki, chyba że przenosimy ją z kontenerem.
- Uprzedzić, że **BLE nie da adresu narzędzia leżącego poza zasięgiem odbiorników**. Do tego potrzebny jest GPS albo telefony
  ([tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md), [przyblizona-lokalizacja-narzedzi.md](przyblizona-lokalizacja-narzedzi.md)).
- Ustalić z Właścicielem kwestie RODO (krok 14), zanim cokolwiek zamontujemy.

**Wizja lokalna** (zabrać 3–5 tagów EYE, telefon z Androidem z aplikacją EYE APP lub nRF Connect, miarkę, latarkę):
- **Baza**: plan pomieszczeń, gdzie leżą narzędzia (regały metalowe, klatki, kontenery), gdzie jest internet (router, gniazdo Ethernet), gniazdka 230 V.
  Pomiar: tag na wiertarce w najdalszym kącie, czy telefon go widzi od miejsca planowanej bramki i z jakim RSSI.
- **Bus**: typ zabudowy (stalowe szuflady Sortimo/Bott, przegroda stalowa między kabiną a ładownią), gdzie jeżdżą narzędzia, gdzie jest instalacja 12 V.
  Pomiar: tag w zamkniętej szufladzie, czy telefon w ładowni go widzi.
- **Kontener**: stalowy czy z płyt, gdzie jest rozdzielnica, czy prąd jest wyłączany na noc, zasięg LTE (telefon na tej samej sieci co planowana SIM).
- **Skrzynie stalowe** (Jobox, skrzynie kierownika): tag w środku, wieko zamknięte. Spodziewam się braku sygnału [?]. Jeśli tak, narzędzia
  w skrzyniach są „widoczne” tylko po otwarciu.

**Wynik**: notatka z wizji (plan bazy z proponowanymi bramkami, lista busów z typem zabudowy, lista budów z kontenerem) i wycena (rozdz. 4).

### Krok 2. Inwentaryzacja (zwykle już jest w aplikacji)

- Firma ma już ewidencję w NarzędziownikuGP (Kod, kategoria, marka, model, numer seryjny, Lokalizacja, zdjęcie) i naklejki QR. Jeśli nie, najpierw
  import i naklejki, a tagi dopiero potem. Tag bez Narzędzia w ewidencji nie ma sensu.
- Spisać przy każdym narzędziu: **materiał obudowy** (plastik, aluminium, stal), czy ma **walizkę**, **płaskie miejsce** na tag, wartość (widzi tylko Właściciel).
- Eksport listy z aplikacji jako arkusz roboczy montażu (Kod, nazwa, decyzja „tag/nie”, sposób mocowania, numer taga).

### Krok 3. Które narzędzia dostają tag

Proponowane reguły (do decyzji Właściciela):

| Tak | Raczej nie | Inaczej |
|---|---|---|
| elektronarzędzia akumulatorowe i sieciowe (wiertarki, wkrętarki, młoty, szlifierki, piły) | drobne narzędzia ręczne poniżej ok. 300 zł [?] | **walizka zamiast narzędzia**, gdy narzędzie nie ma płaskiej powierzchni albo nagrzewa się (np. opalarka). Wtedy szukamy walizki |
| pomiarowe (niwelatory, lasery, dalmierze, poziomice długie) | materiały eksploatacyjne | **zestawy** (np. skrzynka kluczy): 1 tag na skrzynkę |
| wszystko, co często wyjeżdża i ginie (z historii Ruchów i Zgłoszeń braku) | maszyny stacjonarne, które nigdy nie opuszczają bazy | sprzęt powyżej kilku tys. zł poza zasięgiem busów: rozważyć GPS ([tanie-lokalizatory-gps.md](tanie-lokalizatory-gps.md)) |

Podpowiedź z danych: lista narzędzi poza bazą z Raportu piątkowego i narzędzia ze Zgłoszeniami braku to naturalni pierwsi kandydaci.
W przykładzie przyjmuję, że **tag dostają wszystkie 150**, a w wariancie oszczędnym **100**.

### Krok 4. Zakup i konfiguracja wstępna tagów (u nas, przed wyjazdem)

**Zakup**: 150 szt. + **10% zapasu** (uszkodzenia przy montażu, wymiany w pierwszym roku). Zapytać WISP.PL i Batna24 o cenę ilościową
(na stronie WISP.PL rabatów nie ma [Z]).

**Schemat identyfikatorów (iBeacon)**:
- **UUID = jeden na Firmę**, generowany w aplikacji przy włączeniu modułu. Dzięki temu bus Firmy A na wspólnej budowie nie raportuje
  tagów Firmy B, bo w Beacon List wpisujemy tylko UUID własnej Firmy (filtr częściowy [Z]; dokładną składnię wpisu „samo UUID” trzeba sprawdzić
  w Configuratorze [?]).
- **major = numer partii konfiguracji** (np. `2610` = październik 2026). Pozwala odróżnić stare tagi od nowych po wymianie i wycofać całą partię.
- **minor = numer taga w Firmie** (1…65535), drukowany na etykiecie.
- **Mapowanie tag → Narzędzie trzyma aplikacja, nie tag.** To świadome odejście od pomysłu „major/minor z Kodu” z
  [nadajniki-ble-nawigacja-do-narzedzi.md](nadajniki-ble-nawigacja-do-narzedzi.md). Kod może się zmienić, a tag przechodzi na inne narzędzie bez rekonfiguracji.
- Dodatkowo zapisujemy **MAC** (nadruk na obudowie EYE [W], NFC w TG-BT5-OUT [Z]). Przydaje się do diagnozy i w trybie Advanced.

**Parametry EYE Beacon** (aplikacja EYE APP na Androidzie, bo na iOS tagi iBeacon są niewidoczne [Z]):

| Parametr | Fabrycznie | Ustawiamy | Uzasadnienie |
|---|---|---|---|
| Protokół | Eddystone [Z] | **iBeacon + EYE Sensor** (typ 3) [Z] | identyfikator + bateria w jednym ogłoszeniu |
| Interwał | 5 s [Z] (strona konfiguracji podaje 1000 ms [Z], rozbieżność) | **3 s** | FMC skanuje okno ~30 s, więc ok. 10 ogłoszeń na skan; producent podaje 4+ lata [Z] |
| Moc TX | 2 dBm [Z] (zakres −14…+8 dBm [Z]) | **2 dBm**, 4–8 dBm tylko dla tagów, które nie przeszły testu w busie | wyższa moc skraca baterię (ile, nie podano [?]) |
| PIN | **123456** [Z] | **własny PIN Firmy** (6 cyfr), zapisany w sejfie haseł GP Engineering, nie w aplikacji klienta | z domyślnym PIN-em każdy może przestawić tag |
| Nazwa | – | `NGP-<minor>` | rozpoznawalność w skanerze |

Dla **TG-BT5-OUT** (MikroTik Beacon Manager): aktywacja magnesem przez 3–10 s [Z], format iBeacon (UUID/major/minor konfigurowalne od wersji 1.0.4 [W])
albo MikroTik przy samych KNOT-ach, interwał 1–3 s, moc w zakresie −28…+6 dBm [Z], **Write Protection** (6 znaków, nieodwracalna [Z]).

**Procedura stanowiska** (moje szacunki: ok. 2–3 min na tag, ok. 6–8 h na 160 tagów [?]):
1. Telefon z Androidem, aplikacja producenta, arkusz z numerami 1…160.
2. Tag po tagu: połączenie, PIN fabryczny, ustawienia z tabeli, nowy PIN, zapis, odczyt kontrolny (czy nadaje iBeacon z właściwym minor).
3. Etykieta z numerem (krok 5), wpis do arkusza: minor, MAC, data.
4. Kontrola zbiorcza: KNOT na biurku albo telefon ze skanerem iBeacon. Wszystkie 160 widoczne, z właściwym UUID i baterią.

### Krok 5. Oznaczenie

- Na tagu: **numer taga (minor)** na etykiecie laminowanej albo grawerowanej. Etykiety drukowanej nie naklejać na stronę, która będzie przyklejona.
  EYE ma wygrawerowany QR do identyfikacji w aplikacji [W]. Czy QR zawiera MAC: [?].
- Na narzędziu: istniejąca naklejka QR z **Kodem** zostaje. Tag montujemy obok niej, żeby przy kontroli było widać oba.
- Na odbiornikach: etykieta „NarzędziownikGP – nie odłączać”, numer odbiornika, telefon do nas.

### Krok 6. Montaż na narzędziach

**Zasady ogólne** (z instrukcji Milwaukee One-Key, Trackunit Kin i Bosch TrackTag):
- Miejsce: **płaska powierzchnia narażona najmniej na ścieranie**. Nie na kratkach wentylacyjnych, ruchomych częściach, naklejkach
  ostrzegawczych, osłonach, rękojeściach, przełącznikach i miejscach, które się grzeją [Z – Milwaukee].
- **Tylną (płaską) stroną do narzędzia, nadrukiem na zewnątrz.** Nie montować pod metalem ani wewnątrz metalowej osłony [Z – Trackunit].
  Metal tłumi 2,4 GHz nawet o 50% i więcej [Z – Minew FAQ, poprzedni research].
- Przygotowanie: odtłuścić alkoholem izopropylowym lub acetonem [Z – Trackunit]. Pod epoksyd lekko zmatowić obie powierzchnie [Z – Milwaukee].
  Milwaukee radzi myć tylko łagodnym mydłem, żeby nie uszkodzić kodu QR na tagu [Z]. Alkoholem przecieramy więc samo narzędzie, nie nadruk.

**Metody:**

| Metoda | Kiedy | Uwagi |
|---|---|---|
| **Epoksyd dwuskładnikowy** | elektronarzędzia (plastikowe korpusy) | metoda Boscha (epoksyd w zestawie) [W] i Milwaukee (matowanie, klejenie, docisk, utwardzenie wg producenta kleju) [Z]. Praktycznie nie do zdjęcia bez śladów, co utrudnia kradzież |
| **Klej MS-polimer** (jak do szyb) | aluminium, stal, lakierowane obudowy | Trackunit [Z]; trochę elastyczny, lepiej znosi drgania (moja ocena [?]) |
| **Śruby / nity** | walizki, statywy, długie poziomice (zaślepki), skrzynki | Milwaukee: **sprawdzić, co jest za ścianką, zanim się wywierci** otwór, wkręty samogwintujące #8 (ok. 4,2 mm) [Z]; Trackunit: dokręcać ręcznie, nie wkrętarką [W]. EYE: 2 otwory [Z]; TG-BT5-OUT: M3 [Z] |
| **Opaska kablowa** | statywy, przedłużacze, drabiny, uchwyty rurowe | jedna opaska przez oba otwory, płasko pod spodem tagu, końcówkę obciąć tak, by nie kaleczyła [Z – Milwaukee]; nylon albo stal 4,8 mm [Z – Trackunit] |
| **Taśma dwustronna (VHB)** | tylko gładkie i czyste powierzchnie bez drgań, w praktyce walizki | EYE: taśma w zaleceniach producenta [Z]; samą taśmę na elektronarzędziach odradzam [?] |
| **Uchwyt / osłona** | lasery i niwelatory (nie wolno zasłonić okna lasera, wyświetlacza ani libelli) | Hilti ma adaptery na opaskę i drut oraz uchwyty metalowe [Z]; przy sprzęcie z kalibracją lepiej mocować do walizki lub statywu, nie do korpusu |

**Gdzie na typowym narzędziu** (propozycja do potwierdzenia w testach [?]):
- **Wiertarka, wkrętarka, młotowiertarka**: bok obudowy silnika, poza kratkami i poza rękojeścią. Nie przy gnieździe akumulatora
  (zaczepia przy wymianie) i nie na spodzie stopki (ścieranie o podłoże).
- **Szlifierka kątowa**: plastikowy korpus silnika po stronie przeciwnej do włącznika, z dala od głowicy (metal i ciepło) i osłony tarczy.
- **Poziomica aluminiowa**: na zaślepce czołowej albo na boku przy końcu, z przekładką z tworzywa 2–3 mm (moja propozycja, nie z dokumentacji [?]).
  Nie na powierzchni pomiarowej.
- **Laser / niwelator**: na walizce albo na podstawie, z dala od okien optycznych. Jeśli tag ma być na samym urządzeniu, to na plastikowej
  części korpusu, której nie dotyka statyw.
- **Walizka (systainer)**: wewnątrz pokrywy, tag nie jest wtedy narażony na uderzenia, a plastik prawie nie tłumi (inferencja [?]).

**Zima**: CR2450 w EYE „-20 °C / +60 °C” [Z]. Teltonika ostrzega, że przy −40 °C napięcie spada i urządzenie może się wyłączyć [Z – EYE FAQ].
Noce poniżej −20 °C w busie są w Polsce możliwe [?], więc tagi mogą „znikać” rano i wracać po ogrzaniu. W aplikacji nie wolno tego od razu
traktować jako zaginięcia.

### Krok 7. Przypisanie tagów w aplikacji (propozycja zmian w NarzędziownikuGP)

Dziś aplikacja nie ma żadnego pojęcia taga. Proponowany minimalny zakres (do ADR i rozmowy o CONTEXT.md):

**Model danych** (nazwy robocze w stylu istniejących migracji, schemat `app`):
- `app.tags`: `id`, `company_id`, `minor`, `major`, `mac`, `model` (EYE/MikroTik), `tool_id` (nullable), `assigned_at`, `retired_at`, `retire_reason`
  (bateria/uszkodzenie/zgubiony). Unikalność `(company_id, major, minor)` i jeden aktywny tag na narzędzie. Historia przypisań ma zostać,
  bo wymiana taga nie może zmieniać historii Ruchów.
- `app.companies` + kolumna `beacon_uuid` (UUID Firmy z kroku 4).
- `app.receivers` (odbiorniki): `id`, `company_id`, `location_id` (pojazd/budowa/baza), `kind` (teltonika/knot), `external_id` (IMEI albo numer seryjny KNOT),
  `token_hash`, `zone_name` (np. „Regały B” w bazie), `last_contact_at`.
- `app.tag_signals` (ostatni sygnał, upsert na tag): `tag_id`, `receiver_id`, `location_id`, `rssi`, `battery_mv`, `low_battery`, `seen_at`.
  Pełnej historii obserwacji nie trzymamy (minimalizacja, por. RODO w kroku 14). Ewentualnie zostaje historia zmian Lokalizacji sygnału.

**Ekrany:**
- **Ustawienia → Lokalizatory** (Właściciel): włączenie modułu, UUID Firmy, lista odbiorników z przypisaną Lokalizacją, ostatni kontakt i token
  do skopiowania przy instalacji KNOT-a.
- **Karta Narzędzia → „Tag”**: przypisz, wymień albo odłącz (Właściciel, Magazynier). Trzy sposoby wskazania taga:
  1. wpisanie numeru z etykiety (minor);
  2. skan QR z obudowy aparatem w PWA. Aplikacja już skanuje QR naklejek, ale treść QR na EYE trzeba sprawdzić [?];
  3. **stanowisko przypisywania**: KNOT w bazie z filtrem RSSI (np. > −50 dBm). Aplikacja pokazuje „najbliższy nieprzypisany tag: nr 87”
     i Magazynier potwierdza przypisanie do H-03. Działa bez Web Bluetooth, którego PWA nie ma (poprzedni research, rozdz. 4.1).
- **Wyszukiwanie i karta Narzędzia**: linia „sygnał” obok ewidencji, tak jak w [przyblizona-lokalizacja-narzedzi.md, rozdz. 8](przyblizona-lokalizacja-narzedzi.md):
  „Ewidencja: Bus WX 1234 (od 3 dni). Sygnał: Bus WX 1234, 12 min temu”.
- **Dzwonek** (propozycje wpisów): „niski stan baterii taga przy H-03”, „H-03 nie słyszany od 14 dni” (tag albo narzędzie zginęło),
  „odbiornik w busie WX 1234 bez kontaktu od 24 h”, „rozbieżność: ewidencja Baza, sygnał Budowa ul. Leśna” z przyciskiem „Zarejestruj ruch”.
  **Sygnał nigdy sam nie tworzy Ruchu** (historia Ruchów tylko się dopisuje i jest ręczna).

### Krok 8. Odbiorniki w busach (Teltonika FMC)

**Montaż** (instalator GPS albo elektryk samochodowy; kosztu nie sprawdzałem [?]):
- Zasilanie stałe +12 V przez bezpiecznik, masa, przewód zapłonu (albo wirtualny zapłon z napięcia lub akcelerometru [?]). Zakres FMC 10–30 V [Z].
- **Umieszczenie**: odbiornik musi „słyszeć” ładownię, a nie tylko kabinę. Przy stalowej przegrodzie kabina–ładownia montować **po stronie ładowni**,
  wysoko na bocznej ścianie albo pod plastikową osłoną sufitu. Nie w metalowej skrzynce. FMC920 ma wewnętrzne anteny GNSS i GSM [W],
  więc po montażu trzeba sprawdzić fix GPS. Jeśli go nie ma, wybrać model z antenami zewnętrznymi (FMC130/FMC150 [?]).
- Ładownia ze stalowymi szufladami: odbiornik nad szufladami. W teście (krok 11) sprawdzić tagi w zamkniętych szufladach.

**Konfiguracja** (Teltonika Configurator lub FOTA WEB; wartości to propozycja startowa [?]):
- System: **Codec 8 Extended** [Z].
- Bluetooth: włączony, ukryty; „Non Stop Scan” wyłączony, okno skanu 30 s co 60 s (tak jak w przykładzie Teltoniki [Z]).
- Beacon List: **Configured** z UUID Firmy (albo *All* na czas testów), tryb **Simple**, rekord **On Change** + okresowy co 300 s na postoju, priorytet Low [Z – opcje].
- Uśpienie: „Bluetooth On While In Sleep” wyłączony + **Periodic Wakeup** co 3600 s na noc [Z – FMB003]. Pobór prądu w tym trybie [?].
- Serwer: domena naszego Traccara albo flespi, TCP, TLS [Z – opcja TLS]. Jeśli klient ma dostawcę GPS: serwer zapasowy w trybie **Duplicate** [Z].
- SIM: 1NCE (12 EUR na 10 lat, 500 MB [W/Z – poprzedni research]). **Szacunek zużycia** (moja inferencja [?]): rekord z ok. 20 beaconami po ok. 25 B
  to ok. 600 B. Przy ok. 200 rekordach dziennie i narzucie TCP/TLS wychodzi rzędu 250 KB/dobę, czyli ok. 90 MB/rok. 500 MB starczy na kilka lat,
  ale trzeba to monitorować w portalu 1NCE.

### Krok 9. Bramki w kontenerach i w bazie (MikroTik KNOT)

**Kontener na budowie:**
- Miejsce: środek kontenera, **2–2,5 m wysoko**, na ścianie z płyty albo pod sufitem, antena BT w dół lub w bok. Nie w metalowej rozdzielnicy
  i nie przy stalowej ścianie (moja propozycja na podstawie Minew FAQ o metalu i montażu wysokim [Z]).
- Zasilanie: z gniazda w kontenerze (zasilacz 24 V w zestawie [Z]). **Rozdzielnica budowlana bywa wyłączana na noc i w weekend** [?].
  Wtedy bramka milczy, a aplikacja musi pokazywać „odbiornik bez zasilania”, a nie „narzędzia zniknęły”. Opcja: mały UPS 12/24 V [?].
- Łączność: antena LTE na SMA **na zewnątrz kontenera** (przepust albo antena magnetyczna na dachu), bo stalowa skrzynia tłumi też LTE.
  SIM z LTE‑M: 1NCE (LTE‑M w PL [Z – poprzedni research]). Uwaga na zużycie danych: HTTPS co 5 min z nowym połączeniem TLS to rzędu
  8 KB × 288 = ok. 2,3 MB/dobę, czyli ok. 70 MB/mies. (moja inferencja [?]). 500 MB z 1NCE starczy wtedy na kilka miesięcy, nie na lata. Rozwiązania: wysyłać
  tylko zmiany (nowy tag, zanik taga) plus „żyję” co godzinę, albo kartę z pakietem miesięcznym (Orange IoT na kartę 0,5 GB/5 zł [Z – poprzedni research]).
- Po zakończeniu budowy KNOT jedzie z kontenerem albo do bazy. W aplikacji zmienia się tylko przypisanie odbiornika do Lokalizacji.

**Baza:**
- 1 KNOT na wyraźną strefę (magazyn zamknięty, wiata, klatka). W przykładzie 2 szt. Zasilanie i internet przez Ethernet z routera biura (PoE‑in [Z]),
  Wi‑Fi jako zapas.
- Strefy myli bliskość regałów metalowych, więc trzeba ustawić filtr RSSI i histerezę. Badanie strefowe to 74–81% trafień
  ([przyblizona-lokalizacja-narzedzi.md, rozdz. 2.1](przyblizona-lokalizacja-narzedzi.md)).
- Jeden KNOT może jednocześnie być **stanowiskiem przypisywania** (krok 7), jeśli stoi przy biurku Magazyniera.

**Skrypt KNOT** (szkic, do napisania i przetestowania [?]): harmonogram co 60–300 s → `/iot bluetooth scanners advertisements print` z filtrem
`data~"<UUID Firmy w hex>"` → zbudowanie JSON `[{mac, rssi, data, time}]` → `/tool fetch mode=https http-method=post http-header-field="Content-Type:application/json,Authorization:Bearer <token>" url="https://narzedziownikgp.pl/…"`
[Z – składnia fetch; Z – pola skanera]. Limit `http-data` to 64 KB [Z], więc przy wielu tagach dzielić na paczki.

### Krok 10. Przepływ danych do aplikacji

- **Pośrednik dla busów**: Traccar na małym VPS-ie w UE (koszt [?]; hosting Traccar od 9,95 USD/mies. wg poprzedniego researchu [Z]),
  urządzenia na porcie 5027 (protokół `teltonika` [Z – poprzedni research]), `forward.type=json`, `forward.url=https://narzedziownikgp.pl/<ścieżka>/traccar`,
  `forward.header=Authorization: Bearer <sekret>`, `forward.retry.enable=true` [Z]. Przy wielu klientach można rozważyć flespi Start (130 EUR/mies.) [Z]
  zamiast utrzymywać własny serwer.
- **Endpoint w aplikacji**: Route Handler `POST` w Next.js 16 (przed implementacją przeczytać
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, zgodnie z AGENTS.md). Zasady:
  - osobny token na odbiornik KNOT (hash w `app.receivers`) i osobny sekret dla Traccara/flespi, a Firmę i Lokalizację wyznacza IMEI odbiornika;
  - odpowiadać szybko (200 po zapisie). Wolumen dla przykładu: 5 busów + 5 KNOT-ów co 60–300 s to kilka tysięcy żądań na dobę;
  - parsowanie iBeacon z surowych danych KNOT-a (prefiks `4C 00 02 15`, UUID, major, minor, Tx) i baterii z protokołu EYE (`2000 + VALUE×10` mV,
    bit 6 = niski stan [Z]);
  - zapis: upsert do `app.tag_signals` tylko przy zmianie odbiornika albo co N minut, nie przy każdym pakiecie;
  - „nie słyszany” wyliczać na odczycie albo zadaniem dziennym w `src/app/zadania/*`, bez osobnego procesu.
- Baza produkcyjna działa przez pooler transakcyjny, więc zapis w jednej transakcji, bez ustawień sesyjnych (zasada z naszych notatek o produkcji).

### Krok 11. Testy odbiorcze (przed zakupem całości: pilotaż 10–20 tagów)

| # | Test | Jak | Kryterium (propozycja [?]) |
|---|---|---|---|
| 1 | Stanowisko | wszystkie skonfigurowane tagi przy KNOT-cie na biurku | 100% widocznych, UUID Firmy, bateria > 2,9 V |
| 2 | Spacer po bazie | 5 otagowanych narzędzi noszonych po strefach, zapis RSSI z każdej bramki | właściwa strefa w ≥ 8 na 10 odczytów po wygładzeniu |
| 3 | Kontener stalowy | narzędzia na półkach, drzwi zamknięte, 30 min | każdy tag słyszany w ≥ 2 kolejnych skanach |
| 4 | Skrzynia stalowa / Jobox | tag w środku, wieko zamknięte | zapisać wynik; jeśli brak sygnału, opisać klientowi jako ograniczenie |
| 5 | Bus – ładownia | narzędzia w szufladach i luzem, drzwi zamknięte, silnik włączony i wyłączony | ≥ 95% tagów w rekordzie po 2 min jazdy |
| 6 | Bus – noc | zostawić na noc z Periodic Wakeup, rano sprawdzić rekordy i napięcie akumulatora | rekord co godzinę, brak spadku akumulatora poniżej progu rozruchu [?] |
| 7 | Wyjęcie z busa | narzędzie wyniesione 20 m | „zniknęło z busa” w aplikacji w ≤ 10 min |
| 8 | Dwa busy obok siebie | tag w busie A, bus B obok | sygnał przypisany do A (RSSI + histereza) w ≥ 9 na 10 przypadków |
| 9 | Moc TX | tagi z testu 5, które nie przeszły, ustawić na 4–8 dBm | powtórka testu 5 |
| 10 | Mróz (opcjonalnie) | tag w zamrażarce −20 °C przez noc | nadaje po wyjęciu, bateria w telemetrii nie spada trwale |

Odniesienie dla zasięgu: Teltonika „80 to 100 m” w otwartym terenie, „10–15 meters” w metalowych naczepach [Z – EYE FAQ]. Hilti: ok. 50 m
na otwartej przestrzeni, ok. 30 m w kontenerze lub magazynie, ok. 10 m pod 3 mm betonu lub błota [W].

### Krok 12. Szkolenie załogi (w ramach Wdrożenia, ok. 1–2 h)

- **Właściciel**: co znaczy linia „sygnał” i czym różni się od ewidencji, alarmy baterii i „nie słyszany”, odbiorniki w ustawieniach, kwestie RODO.
- **Magazynier i Kierownicy**: przypisanie i wymiana taga, stanowisko przypisywania, dalej **rejestrujemy Ruchy** (sygnał ich nie zastępuje),
  co robić z alarmem rozbieżności, gdzie leży zapas tagów.
- **Kierowcy busów**: nie odłączać odbiornika, nie zasłaniać go, zgłaszać uszkodzenia instalacji.
- **Pracownicy**: tagów nie odrywać i nie zaklejać, uszkodzony tag zgłaszać jak uszkodzenie (Zgłoszenie). Informacja o przetwarzaniu danych (krok 14).
- Krótka instrukcja na 1 stronę A4 do kontenera i busa.

### Krok 13. Utrzymanie

- **Bateria**: w EYE i TG-BT5-OUT jest niewymienna [Z], więc „wymiana baterii” oznacza **wymianę taga**. Plan: przy 3 s wymiana EYE po ok. 3–4 latach
  albo wcześniej po fladze „low battery” (EYE FAQ: 2,5–2,2 V to ok. 10–15% pojemności [Z]). Zapas ok. 10% tagów rocznie (zgubienia, uszkodzenia, wcześniejsze rozładowania [?]).
- **Alerty**: niski stan baterii (flaga EYE albo napięcie < 2,5 V), tag nie słyszany od 14 dni, odbiornik bez kontaktu od 24 h, tag słyszany w Lokalizacji innej niż ewidencja.
- **Zagubione tagi**: tag „nie słyszany” przy narzędziu w bazie oznacza, że odpadł albo się rozładował. Raz na kwartał spis kontrolny: wszystkie narzędzia
  w bazie powinny mieć sygnał z bazy. Brak sygnału to zadanie dla Magazyniera.
- **Wymiana taga**: w aplikacji „wymień tag” (stary dostaje `retired_at` i powód, nowy przejmuje narzędzie). Historia Ruchów się nie zmienia.
- **Oprogramowanie**: firmware EYE przez EYE APP [Z], FMC przez FOTA WEB [W], KNOT przez RouterOS (aktualizacje ręcznie lub skryptem [?]).
- **Przegląd roczny**: test 5 i 7 z kroku 11 w każdym busie, kontrola anten i zasilania w kontenerach.

### Krok 14. RODO i Kodeks pracy (krótko)

- Odbiornik w **busie** daje też pozycję kierowcy. W poprzednim researchu jest WP249 („Vehicle tracking devices are not staff tracking devices”),
  zasada godzin pracy i brak oceny kierowcy: [przyblizona-lokalizacja-narzedzi.md, rozdz. 1.5](przyblizona-lokalizacja-narzedzi.md).
- Bramki **stałe** (baza, kontener) śledzą narzędzia, nie ludzi. Ryzyko rośnie, gdy narzędzie jest przypisane do konkretnej osoby.
  Minimalizacja: przechowujemy tylko ostatni sygnał, bez historii tras.
- Jeśli kiedyś dojdą **telefony pracowników** jako skanery, to DPIA (wykaz UODO), art. 22³ k.p. (regulamin, informacja 2 tygodnie przed startem)
  i minimalizacja z tamtego dokumentu.
- Nowi odbiorcy danych (VPS z Traccarem, flespi, dostawca GPS w trybie Duplicate) trzeba uwzględnić w **umowie powierzenia** i w polityce prywatności (dokumenty prawne są wciąż projektem).
  Wymaga to oceny prawnika [?].

---

## 3. Lista kontrolna wdrożenia

**Przed sprzedażą**
- [ ] Rozmowa z Właścicielem: problem, busy z GPS?, kontenery z prądem?, ograniczenia BLE wyjaśnione
- [ ] Wizja lokalna: baza (plan, internet, gniazdka), busy (zabudowa, przegroda), kontenery (rozdzielnica, LTE), skrzynie stalowe
- [ ] Pomiar 3–5 tagami w miejscach krytycznych
- [ ] Wycena i akceptacja; ustalenia RODO (informacja dla załogi, umowa powierzenia)

**Pilotaż (10–20 tagów, 1 bus, 1 KNOT)**
- [ ] Zakup próbek, konfiguracja wg kroku 4, montaż na reprezentatywnych narzędziach
- [ ] Testy 1–9 z kroku 11, protokół z wynikami
- [ ] Decyzja: tag EYE czy MikroTik, moc TX, interwał, lista narzędzi

**Przygotowanie (u nas)**
- [ ] Moduł włączony dla Firmy, UUID Firmy wygenerowany
- [ ] Zakup tagów + 10% zapasu, odbiorników, SIM, anten, materiałów montażowych
- [ ] Konfiguracja tagów (UUID/major/minor, 3 s, 2 dBm, iBeacon + EYE, własny PIN), arkusz minor ↔ MAC
- [ ] Konfiguracja FMC (Codec 8E, Beacon List, sen, serwer) i KNOT (skrypt, token), konta w Traccarze/flespi
- [ ] Odbiorniki dodane w aplikacji i przypisane do Lokalizacji

**U klienta**
- [ ] Montaż odbiorników w busach (instalator) i test fixu GPS
- [ ] Montaż KNOT-ów w bazie i kontenerach, anteny LTE, zasilanie
- [ ] Montaż tagów (epoksyd i klej utwardzane wg producenta), etykiety, przypisanie w aplikacji
- [ ] Testy odbiorcze 2–8 na docelowej instalacji
- [ ] Szkolenie ról, instrukcja A4 w busach i kontenerach

**Po starcie**
- [ ] Po tygodniu: przegląd tagów „nie słyszanych”, odbiorników bez kontaktu i zużycia danych SIM
- [ ] Po miesiącu: rozmowa z Właścicielem, korekta progów (RSSI, „nie słyszany od”)
- [ ] Co kwartał: spis kontrolny w bazie; co rok: przegląd busów i kontenerów

---

## 4. Koszt dla przykładowego klienta

Założenia: 150 narzędzi z tagiem + 15 szt. zapasu (165), 5 busów, 1 baza (2 KNOT-y), 3 budowy z kontenerem (3 KNOT-y). Ceny netto z 2026-10-01
(WISP.PL [Z]) bez rabatów ilościowych. Pozycje oznaczone [?] to moje szacunki.

| Pozycja | Wariant główny (EYE) | Wariant tańszy (MikroTik OUT) |
|---|---|---|
| Tagi 165 szt. | 165 × 87,70 = **14 470 zł** | 165 × 51,15 = **8 440 zł** |
| Odbiorniki w busach 5 × FMC920 | 5 × 182,04 = **910 zł** | 910 zł (albo 5 × KNOT = 1 452 zł bez pośrednika, rozdz. 1.3) |
| Montaż w busach (instalator) | 5 × 150–250 zł = 750–1 250 zł [?] | jw. |
| Bramki baza + budowy 5 × KNOT | 5 × 290,30 = **1 452 zł** | 1 452 zł |
| Anteny LTE/BT do KNOT-ów, kable | ok. 300–500 zł [?] | jw. |
| SIM 8 szt. (5 busów + 3 kontenery) | 1NCE ≈ 8 × 55–65 zł ≈ 480 zł (10 lat, 500 MB) [Z/W – poprzedni research]; kontenery mogą wymagać pakietów miesięcznych (krok 9) | jw. |
| Materiały montażowe (epoksyd, MS-polimer, śruby, opaski, przekładki, etykiety) | ok. 3–5 zł/tag ≈ 500–800 zł [?] | jw. |
| **Sprzęt i materiały razem** | **ok. 18,9–19,9 tys. zł** | **ok. 12,8–13,8 tys. zł** |
| Robocizna wdrożenia (konfiguracja 165 tagów ~1 dzień, montaż na narzędziach ~2 dni, bramki i testy ~1–1,5 dnia, szkolenie) | ok. 4–5 roboczodni [?] | jw. |
| Koszty stałe | Traccar VPS ok. 20–50 zł/mies. [?]; doładowania SIM w kontenerach (Orange IoT 5 zł/31 dni/szt. [Z – poprzedni research]) | jw. |
| Wymiany tagów (od 3.–4. roku) i straty ok. 10%/rok | ok. 1,4 tys. zł/rok [?] | ok. 0,8 tys. zł/rok [?] |

Wariant oszczędny „tylko 100 narzędzi”: tagi 110 × 87,70 = 9 647 zł (EYE) albo 110 × 51,15 = 5 627 zł (MikroTik), reszta bez zmian.
Sprzęt razem wychodzi wtedy ok. 14–15 tys. zł albo ok. 10–11 tys. zł.

Dla porównania: GPS na 200 narzędziach to ok. 130 tys. zł na 3 lata, a GPS na 20 najcenniejszych ok. 15,5 tys. zł
([tanie-lokalizatory-gps.md, rozdz. 4](tanie-lokalizatory-gps.md)). BLE kosztuje mniej więcej tyle co GPS na 20 narzędziach, a obejmuje cały park,
tyle że daje wiedzę tylko „w zasięgu odbiorników”. Sensowna oferta to hybryda: BLE na wszystko plus GPS na kilka najdroższych sztuk.

---

## 5. Czego nie zweryfikowałem

- Żywotność EYE przy 1 s i przy mocy wyższej niż 2 dBm; podejrzanie duży skok 4 → 8 lat między 3 a 5 s.
- Czy TG-BT5-OUT nadaje kilka formatów naraz (iBeacon + MikroTik z baterią) i jaka jest jego żywotność w trybie iBeacon.
- Udarność TG-BT5-OUT (brak IK) i rzeczywista odporność EYE na upadki z wysokości (IK10 dotyczy energii uderzenia, nie testu upadku).
- Aktualny, nie-EOL model Teltoniki z Beacon List do busów (sprzeczne sygnały na stronach producenta); czy FTC921 ma Beacon List.
- Składnia filtra „samo UUID” w Beacon List; zachowanie FMC920 w uśpieniu (opis jest dla FMB003); pobór prądu z Periodic Wakeup.
- Czy flespi przekazuje baterię EYE z AVL 385; dokładny format JSON strumienia flespi (dane tylko z bazy wiedzy, [W]).
- Treść QR wygrawerowanego na EYE (czy to MAC).
- Anteny w zestawie KNOT, zasięg LTE‑M w stalowym kontenerze, zużycie danych SIM (moje szacunki).
- Ceny ilościowe tagów (WISP.PL, Batna24), cena instalacji FMC w busie, koszt VPS.
- Dane o MOKO i Kontakt.io (strony producentów zwracały 403, tylko wyniki wyszukiwarki).
- Rzeczywisty zasięg w stalowej skrzyni, szufladach busa i na metalowych korpusach. To ma pokazać pilotaż (krok 11).
- Kwalifikacja prawna odbiorników w busach i nowych podmiotów przetwarzających (prawnik).

---

## 6. Źródła

**Tagi**
- Teltonika EYE Beacon BTSID1 (wiki): <https://wiki.teltonika-gps.com/view/EYE_BEACON_/_BTSID1>
- Teltonika EYE Sensor BTSMP1 (wiki): <https://wiki.teltonika-gps.com/view/EYE_SENSOR_/_BTSMP1>
- EYE Quick Manual v4.9 (PDF): <https://wiki.teltonika-gps.com/images/f/f3/QM-BTSMP1.pdf>
- Konfiguracja EYE (protokoły, interwał, TX, PIN, bateria): <https://wiki.teltonika-gps.com/view/Configuring_EYE_beacons>
- EYE FAQ (bateria, zasięg w metalu, mróz): <https://wiki.teltonika-gps.com/view/EYE_FAQ>
- WISP.PL EYE Beacon: <https://www.wisp.pl/p9037,teltonika-eye-beacon-btsid1.html>; Allegro: <https://allegro.pl/oferta/teltonika-eye-beacon-btsid1-czujnik-ble-id-bluetooth-17002631029> [W];
  PanGPS: <https://pangps.pl/pl/p/Lokalizator-GPS-Teltonika-EYE-Beacon-BTSID1/119> [W]; 2it.pl: <https://2it.pl/produkt/823636/teltonika-eye-beacon-btsid1> [W]
- MikroTik TG-BT5-OUT: <https://mikrotik.com/product/tg_bt5_out>, instrukcja <https://help.mikrotik.com/docs/spaces/UM/pages/70615041/TG-BT5-OUT>,
  karta katalogowa <https://cdn.mikrotik.com/web-assets/product_files/TG-BT5-INTG-BT5-OUT_220249.pdf>, WISP.PL <https://www.wisp.pl/p8667,mikrotik-bluetooth-tag-zewnetrzny-tg-bt5-out.html>
- MikroTik Beacon Manager (Android): <https://help.mikrotik.com/docs/spaces/UM/pages/105742455/MikroTik+Beacon+Manager+for+Android+devices>;
  formaty ogłoszeń: <https://help.mikrotik.com/docs/spaces/UM/pages/105742533/MikroTik+Tag+advertisement+formats>
- Minew E9: <https://www.minew.com/product/e9-waterproof-beacon/>, <https://www.minewstore.com/product/e9-waterproof-beacon>
- Kontakt.io Asset Tag 2: <https://support.kontakt.io/hc/en-gb/articles/4413238412946-Asset-Tag-2-technical-specifications> [W – 403]
- MOKO: <https://www.mokosmart.com/m8m9-series-rugged-asset-tag/>, <https://www.mokosmart.com/asset-tracking-beacon-m2/> [W – 403]

**Systemy referencyjne i montaż**
- Hilti AI T320: <https://www.hilti.co.uk/c/CLS_CUSTOMER_SOFTWARE/CLS_ACCESSORIES_SOFTWARE/r12865554>
- Milwaukee Tick: <https://www.milwaukeetool.com/Products/48-21-2000>; montaż tagu One-Key: <https://onekeysupport.milwaukeetool.com/en/knowledge/attach-tracking-tag>
- Trackunit Kin (instalacja): <https://help.trackunit.com/en/articles/146419-how-do-i-install-activate-onboard-and-recover-kin-tags>
- Bosch TrackTag (źródło wtórne): <https://toolguyd.com/bosch-tracktag-bluetooth-tool-tracking/> [W]

**Odbiorniki**
- Teltonika Beacon List: <https://wiki.teltonika-gps.com/view/FMC150_Beacon_List>, <https://wiki.teltonika-gps.com/view/FMC920_Beacon_List>, <https://wiki.teltonika-gps.com/view/FMC130_Beacon_List>
- Teltonika beacony – start i Codec 8E: <https://wiki.teltonika-gps.com/view/How_to_start_with_FMB_devices_and_Beacons%3F>; Codec: <https://wiki.teltonika-gps.com/view/Codec>
- Teltonika Bluetooth 4.0 (FMC150): <https://wiki.teltonika-gps.com/view/FMC150_Bluetooth_4.0_settings>; serwery i Duplicate: <https://wiki.teltonika-gps.com/view/FMC150_GPRS_settings>
- Teltonika sen i Periodic Wakeup: <https://wiki.teltonika-gps.com/view/FMB003_System_settings>, <https://wiki.teltonika-gps.com/view/FMC920_Sleep_modes>
- Teltonika indoor: <https://wiki.teltonika-gps.com/view/Indoor_tracking_solution>
- Teltonika EOL: <https://www.teltonika-gps.com/support/eol-products>, <https://www.teltonika-gps.com/products/trackers/basic/fmc920>, <https://www.teltonika-gps.com/products/trackers/advanced/fmc130>, <https://www.teltonika-gps.com/products/trackers/can-data/fmc150>
- Teltonika FOTA WEB: <https://www.teltonika-gps.com/solutions/fota-web> [W – 503]
- WISP.PL: FMC150 <https://www.wisp.pl/p10081,teltonika-fmc150.html>, lista Teltonika <https://www.wisp.pl/k210,teltonika-sledzenie-pojazdow.html>, KNOT <https://www.wisp.pl/p8315,mikrotik-knot-rb924i-2nd-bt5-bg77.html>
- Teltonika Networks (RUTX, EYE): <https://wiki.teltonika-networks.com/view/Bluetooth_EYE_Sensor_and_EYE_Beacon_support>, <https://wiki.teltonika-networks.com/view/Teltonika_EYE_device_pairing_and_data_sender_configuration_example>
- MikroTik KNOT: <https://mikrotik.com/product/knot>; Bluetooth w RouterOS: <https://help.mikrotik.com/docs/spaces/ROS/pages/78086201/Bluetooth>;
  śledzenie tagów przez MQTT: <https://help.mikrotik.com/docs/spaces/ROS/pages/176914435/Bluetooth+tag-tracking+using+MQTT+and+ThingsBoard>; Fetch: <https://help.mikrotik.com/docs/spaces/ROS/pages/8978514/Fetch>
- Minew MG6: <https://www.minew.com/product/mg6-4g-bluetooth-stellar-gateway/>, <https://www.minewstore.com/product/mg6-bluetooth-stellar-gateway>
- Ruuvi Gateway: <https://ruuvi.com/gateway/>

**Droga danych**
- Vercel – tylko HTTP: <https://vercel.com/kb/guide/docker-monolith-workers-vercel>
- Traccar forward: <https://www.traccar.org/forward/>; dekoder Teltoniki: <https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/protocol/TeltonikaProtocolDecoder.java>
- flespi: cennik <https://flespi.com/pricing>, strumień HTTP <https://flespi.com/kb/how-to-get-data-in-your-platform-via-flespi-http-stream> [W],
  beacony <https://flespi.com/blog/affordable-asset-tracking-with-ble-beacons>, `ble.beacons` <https://flespi.com/kb/how-to-sort-blebeacons-by-signal-strength> [W]
- 1NCE: <https://www.1nce.com/en-eu> [W]
- Next.js Route Handlers (lokalnie): `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
