# NarzędziownikGP

Ewidencja i monitorowanie narzędzi dla małych firm budowlanych: gdzie w danej chwili jest każdy egzemplarz sprzętu, kto za niego odpowiada i co leży za długo poza bazą.

## Ludzie i role

**Firma**:
Klient NarzędziownikaGP. Każdy rekord domenowy należy do dokładnie jednej firmy.
_Avoid_: klient, tenant, organizacja

**Właściciel**:
Rola w firmie z pełnymi uprawnieniami, jedyna widząca wartości sprzętu w złotówkach (kierownik, któremu pozwoliła widzieć koszty, wyliczy je ze stawki procentowej).
_Avoid_: szef, admin

**Kierownik**:
Rola w firmie odpowiadająca za sprzęt na swoich budowach i pojazdach; rejestruje ruchy.
_Avoid_: brygadzista, majster

**Magazynier**:
Rola w firmie obsługująca bazę; rejestruje ruchy dla wszystkich lokalizacji.

**Pracownik**:
Rola w firmie bez prawa do ruchów: widzi, gdzie jest sprzęt, i składa zgłoszenia. Loguje się nazwą użytkownika nadaną przez właściciela, bez wymogu e-maila.
_Avoid_: robotnik, użytkownik (jako nazwa roli)

**Ludzie**:
Kartoteka wszystkich osób firmy: konta w programie i osoby bez konta, pozycja „Ludzie” w menu. Prowadzi ją właściciel; przy osobie widać, czy ma konto i jaką rolę. Kierownik widzi w niej osoby z uprawnieniami, a magazynier i pracownik tylko własne uprawnienia („Moje uprawnienia”).
_Avoid_: zespół, kadry, pracownicy (pracownik to rola)

**Osoba**:
Wpis w kartotece Ludzie: imię i nazwisko, notatka, aktywna albo nieaktywna i najwyżej jedno konto (konto ma jedną osobę). Osoba bez konta, np. robotnik bez telefonu, nie loguje się i nie zajmuje miejsca w pakiecie wdrożenia; konto zakłada się jej później bez drugiego wpisu. Nieaktywna (odeszła z firmy) znika z aktywnych, a jej historia zostaje; dezaktywacja osoby z kontem blokuje też konto.
_Avoid_: użytkownik, członek zespołu, pracownik (to rola)

**Uprawnienie**:
Badanie, szkolenie albo uprawnienie osoby z datą „ważne do”: badania lekarskie okresowe, szkolenie BHP okresowe, badania do pracy na wysokości, SEP E/D, UDT (z urządzeniem), prawo jazdy (z kategorią), kurs pierwszej pomocy albo własny rodzaj firmy. Ma opcjonalny cykl w miesiącach, notatkę i dokumenty, a odnowienie przesuwa datę o cykl. Z badań lekarskich zapisujemy tylko datę, a orzeczenie widzi tylko właściciel. Wpisują je właściciel i kierownik i oni widzą wszystkie, a każdy widzi własne. Przypomina 30 dni przed końcem ważności i raz po: właścicielowi zbiorczo, osobie z kontem o własnych.
_Avoid_: certyfikat, kwalifikacja, termin (to przy narzędziu), szkolenie (jako ogólne pojęcie)

**Firma demo**:
Przykładowa firma (DemoBud) z pełnymi danymi, którą pokazujemy zainteresowanym klientom. Na stronie /demo wchodzi się do niej bez hasła jako dowolna rola i przełącza role paskiem u góry. Konto roli dzielą wszyscy oglądający, więc czat z supportem i powiadomienia push są w demo wyłączone. Nowe demo zastępuje poprzednie, które znika w całości; co godzinę demo, w którym ktoś był i skończył oglądać, zastępuje świeże.
_Avoid_: konto testowe, piaskownica

**Strona o programie**:
Publiczna strona dla właściciela firmy budowlanej z funkcjami, cennikiem, wejściem do demo i kontaktem handlowym. Niezalogowany widzi ją pod adresem głównym, zalogowany ma tam tablicę.
_Avoid_: strona główna (to tablica)

**Dziennik demo**:
Lista wizyt w demo dla super-admina: wejścia do ról, otwierane ekrany i akcje oglądających. Wizyta to jedna przeglądarka, także po przełączeniu roli. Zostaje po usunięciu firmy demo.
_Avoid_: analityka, śledzenie

**Samouczek**:
Pierwsze kroki właściciela (kierownik, budowa, narzędzia, naklejki QR, odhaczane stanem firmy) albo krótki samouczek zapisu ruchu dla kierownika i magazyniera. Startuje sam po pierwszym logowaniu, dopóki go nie pominięto ani nie ukończono; potem otwiera się z menu pod trzema kreskami. Pracownik i firma demo go nie mają.
_Avoid_: onboarding (to wdrożenie), tutorial, przewodnik (to przewodnik po tablicy w demo)

**Super-admin**:
Globalna rola dostawcy (GP Engineering) poza firmami: zakłada i usuwa firmy, pilnuje abonamentów, odpowiada na czacie z supportem.
_Avoid_: support (jako nazwa roli), administrator

**Usunięcie firmy**:
Nieodwracalne usunięcie firmy w całości, z historią, plikami i kontami, przez super-admina na polecenie firmy po końcu umowy. Tylko w trybie tylko do odczytu i po wpisaniu nazwy firmy; zostaje wpis w dzienniku usuniętych firm.
_Avoid_: archiwizacja, dezaktywacja (to osoba albo jej konto)

**Dziennik usuniętych firm**:
Lista usunięć dla super-admina: która firma (nazwa), kiedy i kto ją usunął. Zostaje po usunięciu, żeby potwierdzić firmie wykonanie polecenia.
_Avoid_: archiwum, kosz

## Lokalizacje

**Lokalizacja**:
Miejsce, w którym narzędzie może być: baza, budowa, serwis albo pojazd.
_Avoid_: miejsce, magazyn (jako ogólne pojęcie)

**Baza**:
Jedyny magazyn firmy; miejsce sprzętu, który nie jest nigdzie wydany. Może mieć adres; wtedy jest na mapie budów i ma plakat do odbijania.
_Avoid_: magazyn, warsztat

**Budowa**:
Lokalizacja z adresem, przypisanym kierownikiem i statusem aktywna albo zakończona. Kierownikiem budowy jest kierownik albo właściciel, który sam ją prowadzi.
_Avoid_: projekt, inwestycja, obiekt

**Serwis**:
Zewnętrzny punkt naprawy; sprzęt w serwisie nie jest ani zaginiony, ani na budowie.

**Pojazd**:
Lokalizacja ruchoma (np. bus brygady) z przypisanym kierownikiem (kierownik albo właściciel, który sam nim jeździ); sprzęt na pojeździe jest poza bazą.
_Avoid_: bus, auto, samochód (jako nazwa rodzaju lokalizacji)

**Poza bazą**:
Każda lokalizacja inna niż baza i serwis. Łączna wartość sprzętu poza bazą to miara ryzyka dla właściciela.

**Mapa budów**:
Mapa na tablicy z bazą (jeśli ma adres) i aktywnymi budowami w miejscu ich adresu. Widzi ją każdy w firmie, a pinezki przesuwa tylko właściciel. Firma demo ma zamiast niej mapę demo z przykładowym położeniem i lokalizatorami.
_Avoid_: mapa lokalizacji (pojazdów i serwisów na niej nie ma)

**Położenie**:
Punkt na mapie budów: z geokodowania adresu albo pinezka postawiona przez właściciela, ważna do zmiany adresu. Budowa bez położenia (nie znaleziono adresu) jest wypisana pod mapą.
_Avoid_: lokalizacja (to miejsce, w którym jest sprzęt), współrzędne GPS

## Narzędzia

**Narzędzie**:
Pojedynczy egzemplarz sprzętu z unikalnym w firmie kodem.
_Avoid_: sprzęt (dla pojedynczej sztuki), przedmiot, asset

**Kod**:
Identyfikator narzędzia w postaci prefiksu kategorii i numeru (H-03, S-01), drukowany na naklejce QR.
_Avoid_: numer, ID

**Stan narzędzia**:
W obiegu, zaginione, wycofane albo zwrócone (sprzęt wynajęty po zwrocie do wypożyczalni).

**Status ewidencji**:
Zgłoszone (dodane przez kierownika, czeka na akceptację właściciela) albo zaakceptowane.

**Uszkodzone**:
Flaga narzędzia ustawiana przez zgłoszenie uszkodzenia. Nie blokuje ruchów; znika po powrocie z serwisu albo decyzją właściciela.
_Avoid_: zepsute, niesprawne (jako stan)

**Zgłoszony brak**:
Dopisek przy narzędziu na tablicy, dopóki jest do niego otwarte zgłoszenie braku lub zaginięcia. Nie jest flagą ani stanem: nie zmienia stanu narzędzia i nie przenosi go do zaginionych (to robi tylko korekta właściciela); znika z zamknięciem ostatniego takiego zgłoszenia.
_Avoid_: zaginione (to stan narzędzia)

**Sprzęt wynajęty**:
Narzędzie z wypożyczalni, przyjęte od razu tam, gdzie stoi (kierownik na swojej budowie albo pojeździe, magazynier i właściciel wszędzie), bez akceptacji, z kodem jak każde, stawką dobową z umowy i terminem zwrotu. Na tablicy ma dopisek „wynajęte”, rusza się zwykłymi ruchami i nie liczy się do limitu narzędzi progu abonamentu. Koszt liczy się ze stawki wypożyczalni przed każdą stawką dzienną, także po terminie zwrotu, aż do zwrotu do wypożyczalni. Właściciel dostaje wpis w dzwonku.
_Avoid_: wypożyczone, najem, sprzęt obcy

**Wypożyczalnia**:
Firma, od której pochodzi sprzęt wynajęty; przy narzędziu zapisuje się tylko jej nazwa.
_Avoid_: dostawca, wynajmujący

## Terminy

**Termin**:
Data przeglądu, kalibracji, badania UDT, końca gwarancji albo zwrotu sprzętu wynajętego przy narzędziu, najwyżej jeden każdego rodzaju, z opcjonalnym cyklem w miesiącach.
_Avoid_: deadline, zadanie, przegląd (jako ogólne pojęcie)

**Wykonanie**:
Wpis, że przegląd, kalibracja albo badanie UDT się odbyły; następny termin to dzień wykonania plus cykl. Gwarancji się nie wykonuje, tylko wygasa.
_Avoid_: zamknięcie terminu, odhaczenie

**Termin zwrotu**:
Dzień, do którego sprzęt wynajęty ma wrócić do wypożyczalni. Powstaje z przyjęciem, bez cyklu i wykonania; przedłużenie to zmiana tej daty przez tych, którzy mogą zapisać zwrot do wypożyczalni. Przypomina dzień przed i raz po, a po nim tablica ma dopisek „po terminie zwrotu”, który niczego nie blokuje.
_Avoid_: koniec wynajmu, data oddania

**Po terminie**:
Stan terminu, którego data minęła bez wpisanego wykonania. Nie blokuje ruchów, tylko ostrzega.
_Avoid_: przeterminowany, zaległy

**Dokument terminu**:
Zdjęcie albo PDF przy terminie: świadectwo kalibracji, protokół, karta gwarancyjna, faktura albo inny. Fakturę widzi tylko właściciel, bo ma cenę.
_Avoid_: załącznik, teczka

**Przypomnienie o terminie**:
Wpis dzwonka na **wyprzedzenie przypomnienia** przed terminem (przy narzędziach tydzień) i raz po nim (przy gwarancji tylko przed), dla właściciela i kierownika lokalizacji, w której jest sprzęt.
_Avoid_: alarm (zarezerwowany dla progu dni)

**Wyprzedzenie przypomnienia**:
Ile dni przed terminem przychodzi przypomnienie „przed”. Zależy od rodzaju terminu i jest stałe w programie, a nie ustawieniem firmy: 7 dni przy terminach narzędzi, przeglądzie technicznym i własnych terminach pojazdu, 30 przy OC, AC, legalizacji tachografu i uprawnieniach ludzi, 1 przy zwrocie sprzętu wynajętego.
_Avoid_: okres powiadomienia, próg (zarezerwowany dla progu dni)

## Koszt sprzętu

**Moduł**:
Część programu z własną podstroną albo zakładką (np. koszt sprzętu), w cenie abonamentu i zawsze włączona u każdej firmy, także w demo.
_Avoid_: dodatek, plugin

**Stawka dzienna**:
Ile kosztuje dzień narzędzia na budowie albo pojeździe: kwota zł/dzień narzędzia, a bez niej procent wartości dla kategorii albo firmy. Każda stawka obowiązuje od dnia ustawienia; ustawia i ogląda je tylko właściciel, a kierownik ze zgodą na koszty widzi je w kosztach swoich lokalizacji.
_Avoid_: amortyzacja, cena wynajmu

**Dzień startu kosztów**:
Dzień, w którym właściciel pierwszy raz ustawił stawkę firmy. Stawki i wartości z tego dnia liczą się wstecz przez całą historię ruchów, a każda późniejsza zmiana od dnia zmiany. Wcześniej zakładka „Koszty” nie pokazuje kwot.

**Koszt sprzętu**:
Dni narzędzi na budowie albo pojeździe razy stawka dzienna z każdego dnia, w zakładce „Koszty” lokalizacji, za całą budowę, miesiąc albo własny zakres. Liczy się każda rozpoczęta doba w Polsce (dzień przeniesienia na obu miejscach), z historii ruchów bez cofniętych; baza i serwis się nie liczą. Widzi go właściciel, a kierownik tylko swoich budów i pojazdów, gdy właściciel na to pozwolił w ustawieniach; magazynier i pracownik nigdy.
_Avoid_: koszt wynajmu, amortyzacja

**Zestawienie kosztów**:
Koszt sprzętu wszystkich budów i pojazdów za miesiąc albo własny zakres, pozycja „Koszty sprzętu” w menu. Pokazuje każdą aktywną budowę i aktywny pojazd, a zakończone i nieaktywne tylko z kosztem w okresie.

## Odbijanie na budowie

**Odbicie**:
Pobyt osoby na budowie albo bazie zapisany skanem plakatu budowy: wejście, a potem wyjście (skan na tej samej budowie, po pytaniu „Kończysz na tej budowie?”) albo przejście (skan na innej budowie zamyka ten pobyt i otwiera nowy). Przy każdym skanie program sprawdza położenie telefonu i zapisuje tylko wynik (na budowie, poza budową z odległością, brak położenia, bez sprawdzenia) i odległość, nigdy współrzędne. Odbicie z wynikiem innym niż „na budowie” się zapisuje, ale trafia do wyjaśnienia: wyjaśnia je właściciel albo kierownik budowy (własne odbicia kierownika wyjaśnia właściciel), z opcjonalną notatką. Odbija się każdy z kontem; widzi je właściciel, kierownik na swoich budowach i każdy własne. W firmie demo położenia się nie sprawdza. Skan bez zasięgu w skanerze programu czeka w kolejce offline i zapisuje się z chwilą skanu, z oznaczeniem „zapisane offline”.
_Avoid_: check-in, ewidencja czasu pracy, wejściówka

**Konflikt odbicia**:
Skan z kolejki offline, który po dotarciu na serwer nie pasuje do odbić zapisanych w międzyczasie: osoba ma już późniejsze odbicie, telefon potwierdził wyjście, a osoba nie jest tu odbita, telefon nie wiedział, że osoba jest tu już odbita, kod plakatu przestał działać albo budowę zakończono. Nie zapisuje się jako odbicie, tylko czeka na liście „Odbicia do wyjaśnienia” właściciela i kierownika budowy (własne kierownika wyjaśnia właściciel, a skan z nieaktualnym kodem tylko właściciel).
_Avoid_: odrzucony ruch (to ruch z kolejki), błąd odbicia

**Plakat budowy**:
Kartka A4 z nazwą budowy, kodem QR i instrukcją, wisząca przy wejściu albo kontenerze; ma ją też baza z adresem. Kod QR prowadzi na stronę odbicia po losowym kodzie plakatu, który nie zdradza budowy; ten sam kod jest wydrukowany do wpisania ręcznie. Drukuje go właściciel albo kierownik budowy, a „Nowy kod” unieważnia stary plakat. Pojazd i serwis plakatu nie mają.
_Avoid_: kod budowy (kod to identyfikator narzędzia), tablica (to ekran „Gdzie jest co”), naklejka (to przy narzędziu)

**Promień odbicia**:
Odległość od położenia budowy albo bazy, do której skan liczy się jako „na budowie”; domyślnie 300 m, zmienia go właściciel (np. dla dużego placu). Budowa bez położenia ma odbicia „bez sprawdzenia”.
_Avoid_: geofence, strefa

## Ruchy

**Ruch**:
Wpis historii przemieszczenia lub zmiany stanu jednego lub wielu narzędzi. Historia ruchów tylko się dopisuje.
_Avoid_: operacja, transakcja, transfer

**Wydanie**:
Ruch z bazy do budowy lub pojazdu.

**Zwrot**:
Ruch z budowy lub pojazdu na bazę.

**Przeniesienie**:
Ruch między budowami lub pojazdami z pominięciem bazy; rejestruje go ten, kto zabiera.

**Przyjęcie**:
Pierwsze pojawienie się narzędzia w ewidencji (dodanie, import, akceptacja zgłoszenia narzędzia).

**Zwrot do wypożyczalni**:
Ruch, który oddaje sprzęt wynajęty: narzędzie przechodzi w stan „zwrócone”, znika z tablicy, wyszukiwania i list wyboru, a zostaje w historii. Zapisuje go kierownik lokalizacji, w której sprzęt stoi, magazynier albo właściciel; autor cofa go w 15 minut jak inne ruchy.
_Avoid_: zwrot (to ruch na bazę), oddanie

**Cofnięcie**:
Ruch odwracający własny ruch autora w ciągu 15 minut; oryginał zostaje w historii jako cofnięty. Przywraca stan sprzed ruchu, także flagę „uszkodzone”, którą zdjął ruch z serwisu.
_Avoid_: usunięcie, anulowanie

**Korekta**:
Ruch właściciela ustawiający faktyczną lokalizację lub stan narzędzia, zawsze z powodem.
_Avoid_: edycja ruchu, poprawka

**Propozycja ruchu**:
Wynik interpretacji nagrania lub tekstu; staje się ruchem dopiero po zatwierdzeniu przez kierownika. Na pytanie („gdzie jest niwelator?”) zamiast propozycji przychodzi odpowiedź, gdzie jest sprzęt.

**Wyszukiwanie**:
Lupa w nagłówku, dla każdej roli: gdzie jest narzędzie, od ilu dni i kto za nie odpowiada, po kodzie, nazwie, marce albo kategorii, także pytaniem głosem.

## Alarmy i raporty

**Próg dni**:
Liczba dni, po której narzędzie na budowie wywołuje alarm; próg firmy albo nadpisany dla narzędzia lub pojazdu.

**Alarm**:
Narzędzie w lokalizacji z progiem dłużej niż obowiązujący próg dni. Na pojeździe domyślnie wyłączony.

**Nieużywane**:
Liczba dni, od kiedy narzędzie na bazie nie wyjeżdżało.

**Raport tygodniowy**:
Pełne podsumowanie dla właściciela w poniedziałek o 7:00, z terminami z najbliższych 30 dni i tymi po terminie.

**Raport piątkowy**:
Krótka lista sprzętu poza bazą w piątek o 16:00: dla właściciela cała firma, dla kierownika jego lokalizacje.
_Avoid_: raport weekendowy

## Zgłoszenia i komunikacja

**Zgłoszenie**:
Sprawa wewnątrz firmy do rozpatrzenia przez właściciela: uszkodzenie, brak lub zaginięcie, albo inne. Ma status otwarte lub zamknięte i wątek komentarzy.
_Avoid_: ticket, reklamacja, zgłoszenie (w znaczeniu nowego narzędzia)

**Zgłoszenie narzędzia**:
Wniosek kierownika o dopisanie do ewidencji sprzętu kupionego na budowę; kończy się akceptacją z kodem i wartością albo odrzuceniem.
_Avoid_: zgłoszenie (bez dopełnienia)

**Dzwonek**:
Skrzynka powiadomień użytkownika o zdarzeniach systemu (zabrany sprzęt, alarm, przypomnienia o terminach, raporty, odrzucone ruchy, płatność). Zgłoszenia i czat mają własne okna.
_Avoid_: powiadomienia (jako nazwa miejsca), inbox

**Czat z supportem**:
Rozmowa użytkownika firmy z GP Engineering, jeden wątek na użytkownika. Działa także w trybie tylko do odczytu; w firmie demo jest wyłączona.
_Avoid_: kontakt, helpdesk

## Abonament

**Próg abonamentu**:
Pakiet firmy z limitem liczby narzędzi. Konta nie wchodzą do limitu narzędzi.

**Wdrożenie**:
Obowiązkowa, jednorazowa opłata na start abonamentu; obejmuje szkolenie z programu na miejscu u klienta albo zdalnie. Cena zależy od pakietu wdrożenia.
_Avoid_: opłata aktywacyjna, onboarding

**Pakiet wdrożenia**:
Mały (do 2 osób zapisujących ruchy), średni (3–6) albo duży (7 i więcej, bez limitu); wyznacza, ile osób zapisujących ruchy firma może mieć. Ponad limit właściciel nie doda kierownika ani magazyniera, a pracownika tak. Wyższy pakiet odblokowuje dodawanie od razu, za dopłatą w wysokości różnicy cen. Firmy sprzed pakietów, zakładane skryptem i firma demo mają duży.
_Avoid_: próg wdrożenia (próg to abonament)

**Osoba zapisująca ruchy**:
Aktywne konto właściciela, kierownika albo magazyniera; zajmuje miejsce w pakiecie wdrożenia. Pracownik, osoba bez konta i dezaktywowane konto miejsca nie zajmują.
_Avoid_: użytkownik płatny, licencja

**Tryb tylko do odczytu**:
Stan firmy, w którym zapisy są zablokowane (poza czatem z supportem), a podgląd i eksport działają.

**Dokumenty prawne**:
Regulamin usługi, polityka prywatności i umowa powierzenia. Otwierają się bez logowania, z logowania, ze strony o programie i z ustawień. Dopóki nie przejrzy ich prawnik, są oznaczone jako projekt. Firma nazywa się w nich „Klient” (regulamin) albo „Administrator” (umowa powierzenia), jak w umowach; w programie i w kodzie zostaje firma.
_Avoid_: warunki, RODO (jako nazwa dokumentu)

**Umowa powierzenia**:
Umowa, w której firma (administrator danych swoich ludzi i tego, co zapisuje w programie) powierza ich przetwarzanie GP Engineering (podmiot przetwarzający). Zawiera się ją razem z umową o usługę.
_Avoid_: DPA, umowa RODO
