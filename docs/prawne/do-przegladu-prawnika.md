# Dokumenty prawne: do przeglądu prawnika

Projekty regulaminu, polityki prywatności i umowy powierzenia są w `messages/prawne/*.pl.md` i na stronach
`/regulamin`, `/polityka-prywatnosci`, `/umowa-powierzenia` (#26). Przygotował je agent na podstawie tego, jak
program działa naprawdę. Przed pierwszym płacącym klientem prawnik musi je przejrzeć. Poniżej sprawy, których agent
nie mógł rozstrzygnąć sam albo które trzeba sprawdzić u dostawców.

Po zatwierdzeniu: w nagłówku każdego pliku `draft: nie` i nowa data w `version` (ADR 0023).

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
8. **Wypowiedzenie i zwrot opłat.** Regulamin (§ 16) daje wypowiedzenie na koniec opłaconego okresu, bez zwrotu
   za niewykorzystany czas. Potwierdzić.
9. **Terminy:** reklamacja 14 dni, zmiana regulaminu z 14-dniowym uprzedzeniem, zawiadomienie o naruszeniu w 48 godzin,
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
8. **Skrzynka supportu** (`SUPPORT_EMAIL`): wiadomości z czatu trafiają e-mailem do skrzynki GP Engineering. Dostawcę
   tej poczty trzeba dopisać do załącznika 3, bo umowa powierzenia obejmuje czat w zakresie danych klienta.

## Obietnice wykonywane ręcznie

Program nie robi tego sam; dokumenty to obiecują, więc ktoś w GP Engineering musi o tym pamiętać (albo trzeba to
zbudować):

1. E-mail do właścicieli o zmianie regulaminu lub polityki (14 dni wcześniej), o planowanej przerwie i o zmianie
   podprocesora. W programie nie ma komunikatu do wszystkich firm.
2. Przypomnienie co 6 miesięcy o decyzji w sprawie danych po zakończeniu umowy (umowa powierzenia § 9 ust. 4).
3. Ręczne usunięcie nagrania, którego nie udało się usunąć po transkrypcji (klucz jest w logu serwera, ADR 0006).
4. Usunięcie albo anonimizacja danych osoby, których nie da się usunąć w programie, w 30 dni (umowa powierzenia § 4 ust. 2).
