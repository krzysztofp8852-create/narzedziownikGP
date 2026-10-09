# Dokumenty prawne: do przeglądu prawnika

Projekty regulaminu, polityki prywatności i umowy powierzenia są w `messages/prawne/*.pl.md` i na stronach
`/regulamin`, `/polityka-prywatnosci`, `/umowa-powierzenia` (#26). Przygotował je agent na podstawie tego, jak
program działa naprawdę. Wzór informacji dla pracowników o odbijaniu na budowie jest
w `messages/prawne/informacja-o-odbijaniu.pl.md` (#84); strony jeszcze nie ma, pokaże go samouczek i wydruk razem
z odbijaniem (#87). Przed pierwszym płacącym klientem prawnik musi je przejrzeć. Poniżej sprawy, których agent
nie mógł rozstrzygnąć sam albo które trzeba sprawdzić u dostawców.

Po zatwierdzeniu: w nagłówku każdego pliku `draft: nie` i nowa data w `version` (ADR 0023).

## Ludzie, uprawnienia i odbijanie na budowie (#78, #84)

Moduły są zawsze włączone u wszystkich firm, więc dokumenty muszą być zatwierdzone, zanim uprawnienia (#86)
i odbijanie (#87) trafią na produkcję. Kartoteka Ludzie z osobami bez konta (#85) działa na produkcji od
2 października 2026; dokumenty opisują ją od tej wersji. Uprawnienia i odbijanie polityka opisuje z wyprzedzeniem
(„wchodzą do programu wkrótce”); te zdania trzeba usunąć, gdy moduły wejdą.

1. **Badania lekarskie to dane o zdrowiu** (art. 9 RODO). Program zapisuje z badań tylko datę ważności, a skan
   orzeczenia dodaje i otwiera tylko właściciel. Czy firma może tu powołać się na art. 9 ust. 2 lit. b RODO w związku
   z art. 229 Kodeksu pracy, także wobec osób, które nie są jej pracownikami (podwykonawcy, umowy cywilnoprawne)? Czy
   przechowywanie skanu orzeczenia w ogóle zostawić, czy wystarczy sama data? Dokumenty traktują jak badania lekarskie
   także badania do pracy na wysokości (to też orzeczenie lekarza), więc w #86 ich skany też musi widzieć tylko
   właściciel, a notatka przy badaniach nie może służyć do opisu stanu zdrowia.
2. **Odbijanie a monitoring pracowników** (art. 22² i 22³ Kodeksu pracy). Program sprawdza położenie telefonu tylko
   w chwili skanu i zapisuje samą odległość od budowy, bez współrzędnych i bez śledzenia w tle. Czy to „inna forma
   monitorowania” z art. 22³ KP, która wymaga wpisu do regulaminu pracy i uprzedzenia pracowników 2 tygodnie
   wcześniej? Jeśli tak, wzór informacji i samouczek powinny to firmie powiedzieć.
3. **Podstawa prawna odbić i czasu na budowie** (art. 6 ust. 1 lit. b, c albo f RODO). Polityka mówi o „zgodzie
   udzielonej w przeglądarce”: to tylko techniczne pozwolenie telefonu, a nie zgoda z RODO, która w relacji pracy
   i tak budzi wątpliwości. Czy to brzmienie zostawić? Wzór informacji zostawia podstawę i okres przechowywania do
   uzupełnienia przez firmę; czy podać firmie podpowiedź?
4. **Informacja dla osób odbijanych przez kierownika i wpisanych do kartoteki bez konta** (art. 14 RODO: dane nie
   pochodzą od nich). Czy wzór informacji wystarczy, jeśli firma przekaże go także im (wydruk przy plakacie)?
5. **Czas przechowywania** odbić, uprawnień i dat badań. Program nie usuwa niczego sam (jak resztę historii). Czy przy
   danych o zdrowiu i odbiciach trzeba dać firmie termin maksymalny albo automatyczne usuwanie (art. 5 ust. 1 lit. e
   RODO)?
6. **Dokumenty uprawnień**: skan prawa jazdy ma zdjęcie twarzy i PESEL. Czy ostrzec przy dodawaniu, że wystarczy
   kategoria i data, czy ograniczyć dokumenty prawa jazdy?
7. **Ocena skutków dla ochrony danych** (art. 35 RODO): dane o zdrowiu pracowników i sprawdzanie położenia w pracy.
   Czy firma-klient musi ją przeprowadzić i jaką pomoc (umowa powierzenia § 4 ust. 3) powinniśmy dać, np. gotowy opis
   przetwarzania w programie?
8. **„Czas na budowie nie jest ewidencją czasu pracy”**: czy to zastrzeżenie (polityka pkt 6, wzór informacji pkt 4)
   wystarczy, żeby firma nie traktowała zestawienia jako ewidencji z art. 149 KP?
9. **Położenie z telefonu**: przeglądarka ustala je u dostawcy systemu (np. usługi lokalizacyjne Google na Androidzie,
   Apple na iPhonie), na zasadach tego dostawcy, zanim program dostanie wynik. Czy trzeba o tym napisać w polityce,
   tak jak o mapie Google?

## Do decyzji prawnika

1. **Jak zawieramy umowę.** Regulamin zakłada ofertę przyjętą e-mailem i akceptację regulaminu przy tej okazji.
   W programie nie ma zapisu akceptacji (np. pola przy pierwszym logowaniu właściciela). Czy to wystarczy, także dla
   umowy powierzenia (art. 28 ust. 9 RODO: forma pisemna, w tym elektroniczna)?
2. **Jednoosobowa działalność na prawach konsumenta** (art. 385⁵ KC, art. 38a u.p.k.). Regulamin (§ 3 ust. 2)
   wyłącza postanowienia sprzeczne z tą ochroną. Czy to wystarczy i czy coś jeszcze trzeba dodać (odstąpienie od umowy)?
3. **Ograniczenie odpowiedzialności** do opłat z 12 miesięcy (regulamin § 14, umowa powierzenia § 10 ust. 2).
   Czy to ograniczenie może dotyczyć szkód z naruszenia RODO?
4. **Brak automatycznego usuwania danych po końcu umowy** to zasada produktu (specyfikacja #1, historyjka 110).
   Umowa powierzenia (§ 9) każe klientowi wybrać usunięcie albo zwrot i przypomina co 6 miesięcy. Czy przechowywanie
   bez terminu do decyzji klienta jest zgodne z art. 28 ust. 3 lit. g RODO, czy trzeba dać termin maksymalny?
5. **Czat z supportem.** Polityka traktuje GP Engineering jako administratora wiadomości na czacie, a umowa powierzenia
   obejmuje je w zakresie, w jakim zawierają dane klienta (np. zrzut ekranu z nazwiskami). Czy ten podział jest dobry?
6. **Dziennik demo** (wizyty w demo bez konta: ekrany, akcje, rodzaj urządzenia, losowe identyfikatory wizyty i sesji, bez IP) nie ma terminu usunięcia
   (ADR 0020). Czy to w ogóle dane osobowe, a jeśli tak, jaki termin wpisać?
7. **Pliki cookies i pamięć urządzenia.** Polityka powołuje się na niezbędność do świadczenia usługi, bez numeru
   artykułu. Wskazać właściwy przepis Prawa komunikacji elektronicznej.
   Google Analytics wczytuje się dopiero po zgodzie na banerze (przyciski „Akceptuję” i „Tylko niezbędne” są równorzędne,
   wycofanie w stopce) i tylko na stronach publicznych (o programie, wejście do demo, dokumenty prawne), nie w programie
   po zalogowaniu. Czy treść banera i punkt 10.3 polityki wystarczą jako informacja przy zbieraniu zgody i czy
   Google przy Analytics to dla nas podmiot przetwarzający, czy osobny administrator?
8. **Wypowiedzenie i zwrot opłat.** Regulamin (§ 16) daje wypowiedzenie na koniec opłaconego okresu, bez zwrotu
   za niewykorzystany czas. Potwierdzić.
9. **Formularz „Zostaw numer, oddzwonimy”** (polityka pkt 3 ust. 3): numer, opcjonalne imię albo firma, strona
   i czas; program usuwa prośbę po roku. Podstawa: art. 6 ust. 1 lit. b RODO (działanie na żądanie przed umową),
   a liczenie próśb lit. f. Pod formularzem jest tylko zdanie z odnośnikiem do polityki, bez pola zgody. Czy to
   wystarczy jako informacja z art. 13 RODO i czy telefon w odpowiedzi na prośbę nie wymaga zgody na marketing
   telefoniczny (art. 398 Prawa komunikacji elektronicznej)? Czy rok to dobry termin?
10. **Terminy:** reklamacja 14 dni, zmiana regulaminu z 14-dniowym uprzedzeniem, zawiadomienie o naruszeniu w 48 godzin,
   usunięcie danych osoby na polecenie w 30 dni, audyt z 14-dniowym uprzedzeniem raz w roku.

## Do sprawdzenia u dostawców (przed pierwszym klientem)

1. **OpenAI**: podmiot umowy dla klientów z EOG (w projekcie: OpenAI Ireland Limited), zawarta umowa powierzenia
   (DPA) na koncie organizacji, udostępnianie danych do trenowania wyłączone w ustawieniach organizacji, czas
   przechowywania zapytań do wykrywania nadużyć, możliwość przechowywania danych w Europie albo zerowej retencji
   (ADR 0005, ADR 0006).
2. **ElevenLabs**: nie jest na liście podprocesorów, bo produkcja korzysta z OpenAI. Włączenie
   `TRANSCRIPTION_PROVIDER=elevenlabs` wymaga dopisania go do załącznika 3 i uprzedzenia klientów. Uwaga: bez planu
   Enterprise ElevenLabs przechowuje nagrania według swojej polityki, co może kłócić się z obietnicą „bez trenowania”.
3. **Supabase**: DPA podpisana na koncie, region `eu-west-1` (ADR 0001), kopie zapasowe w planie i ich czas
   przechowywania (umowa powierzenia § 9 ust. 5), wysyłka e-maili logowania (reset hasła) przez SMTP Supabase albo
   własny.
4. **Vercel**: DPA, region funkcji `fra1`, czas przechowywania logów z adresami IP (polityka pkt 3 ust. 5).
5. **Resend**: pełna nazwa podmiotu (w projekcie: Plus Five Five, Inc.), DPA, region wysyłki.
6. **Usługi push** (Google, Apple, Mozilla): polityka opisuje je jako odbiorców zaszyfrowanej wiadomości, a nie
   podprocesorów, bo wybiera je przeglądarka użytkownika. Potwierdzić.
7. **Dostęp do produkcji**: kto w GP Engineering ma dostęp i czy konta mają logowanie dwuskładnikowe (załącznik 2).
8. **Skrzynka supportu** (`SUPPORT_EMAIL`): wiadomości z czatu i prośby o telefon trafiają e-mailem do skrzynki GP Engineering. Dostawcę
   tej poczty trzeba dopisać do załącznika 3, bo umowa powierzenia obejmuje czat w zakresie danych klienta.
9. **Google Maps Platform** (mapa budów, ADR 0026): załącznik 3 podaje Google Ireland Limited. Potwierdzić podmiot
   umowy Google Maps Platform dla EOG i czy według warunków ochrony danych Maps Platform Google jest podprocesorem,
   czy osobnym administratorem (wtedy zmienia się brzmienie załącznika 3 i punktu 8 polityki prywatności). Mapę
   pobiera przeglądarka użytkownika bezpośrednio od Google, więc Google widzi jej adres IP.

## Obietnice wykonywane ręcznie

Program nie robi tego sam; dokumenty to obiecują, więc ktoś w GP Engineering musi o tym pamiętać (albo trzeba to
zbudować):

1. E-mail do właścicieli o zmianie regulaminu lub polityki (14 dni wcześniej), o planowanej przerwie i o zmianie
   podprocesora. W programie nie ma komunikatu do wszystkich firm.
2. Przypomnienie co 6 miesięcy o decyzji w sprawie danych po zakończeniu umowy (umowa powierzenia § 9 ust. 4).
3. Ręczne usunięcie nagrania, którego nie udało się usunąć po transkrypcji (klucz jest w logu serwera, ADR 0006).
4. Usunięcie albo anonimizacja danych osoby, których nie da się usunąć w programie, w 30 dni (umowa powierzenia § 4 ust. 2).
5. Wzór informacji o odbijaniu w programie (umowa powierzenia § 4 ust. 4): do czasu odbijania (#87) program go nie
   pokazuje, więc na prośbę firmy wysyłamy go e-mailem.
