# NarzędziownikGP

Ewidencja i monitorowanie narzędzi dla małych firm budowlanych: gdzie w danej chwili jest każdy egzemplarz sprzętu, kto za niego odpowiada i co leży za długo poza bazą.

## Ludzie i role

**Firma**:
Klient NarzędziownikaGP. Każdy rekord domenowy należy do dokładnie jednej firmy.
_Avoid_: klient, tenant, organizacja

**Właściciel**:
Rola w firmie z pełnymi uprawnieniami, jedyna widząca wartości sprzętu w złotówkach.
_Avoid_: szef, admin

**Kierownik**:
Rola w firmie odpowiadająca za sprzęt na swoich budowach i pojazdach; rejestruje ruchy.
_Avoid_: brygadzista, majster

**Magazynier**:
Rola w firmie obsługująca bazę; rejestruje ruchy dla wszystkich lokalizacji.

**Pracownik**:
Rola w firmie bez prawa do ruchów: widzi, gdzie jest sprzęt, i składa zgłoszenia. Loguje się nazwą użytkownika nadaną przez właściciela, bez wymogu e-maila.
_Avoid_: robotnik, użytkownik (jako nazwa roli)

**Firma demo**:
Przykładowa firma (DemoBud) z pełnymi danymi, którą pokazujemy zainteresowanym klientom. Na stronie /demo wchodzi się do niej bez hasła jako dowolna rola i przełącza role paskiem u góry. Konto roli dzielą wszyscy oglądający, więc czat z supportem i powiadomienia push są w demo wyłączone. Nowe demo zastępuje poprzednie, które znika w całości; co godzinę demo, w którym ktoś był i skończył oglądać, zastępuje świeże.
_Avoid_: konto testowe, piaskownica

**Dziennik demo**:
Lista wizyt w demo dla super-admina: wejścia do ról, otwierane ekrany i akcje oglądających. Wizyta to jedna przeglądarka, także po przełączeniu roli. Zostaje po usunięciu firmy demo.
_Avoid_: analityka, śledzenie

**Super-admin**:
Globalna rola dostawcy (GP Engineering) poza firmami: zakłada firmy, pilnuje abonamentów, odpowiada na czacie z supportem.
_Avoid_: support (jako nazwa roli), administrator

## Lokalizacje

**Lokalizacja**:
Miejsce, w którym narzędzie może być: baza, budowa, serwis albo pojazd.
_Avoid_: miejsce, magazyn (jako ogólne pojęcie)

**Baza**:
Jedyny magazyn firmy; miejsce sprzętu, który nie jest nigdzie wydany.
_Avoid_: magazyn, warsztat

**Budowa**:
Lokalizacja z adresem, przypisanym kierownikiem i statusem aktywna albo zakończona.
_Avoid_: projekt, inwestycja, obiekt

**Serwis**:
Zewnętrzny punkt naprawy; sprzęt w serwisie nie jest ani zaginiony, ani na budowie.

**Pojazd**:
Lokalizacja ruchoma (np. bus brygady) z przypisanym kierownikiem; sprzęt na pojeździe jest poza bazą.
_Avoid_: bus, auto, samochód (jako nazwa rodzaju lokalizacji)

**Poza bazą**:
Każda lokalizacja inna niż baza i serwis. Łączna wartość sprzętu poza bazą to miara ryzyka dla właściciela.

## Narzędzia

**Narzędzie**:
Pojedynczy egzemplarz sprzętu z unikalnym w firmie kodem.
_Avoid_: sprzęt (dla pojedynczej sztuki), przedmiot, asset

**Kod**:
Identyfikator narzędzia w postaci prefiksu kategorii i numeru (H-03, S-01), drukowany na naklejce QR.
_Avoid_: numer, ID

**Stan narzędzia**:
W obiegu, zaginione albo wycofane.

**Status ewidencji**:
Zgłoszone (dodane przez kierownika, czeka na akceptację właściciela) albo zaakceptowane.

**Uszkodzone**:
Flaga narzędzia ustawiana przez zgłoszenie uszkodzenia. Nie blokuje ruchów; znika po powrocie z serwisu albo decyzją właściciela.
_Avoid_: zepsute, niesprawne (jako stan)

## Terminy

**Termin**:
Data przeglądu, kalibracji, badania UDT albo końca gwarancji przy narzędziu, najwyżej jeden każdego rodzaju, z opcjonalnym cyklem w miesiącach.
_Avoid_: deadline, zadanie, przegląd (jako ogólne pojęcie)

**Wykonanie**:
Wpis, że przegląd, kalibracja albo badanie UDT się odbyły; następny termin to dzień wykonania plus cykl. Gwarancji się nie wykonuje, tylko wygasa.
_Avoid_: zamknięcie terminu, odhaczenie

**Po terminie**:
Stan terminu, którego data minęła bez wpisanego wykonania. Nie blokuje ruchów, tylko ostrzega.
_Avoid_: przeterminowany, zaległy

**Dokument terminu**:
Zdjęcie albo PDF przy terminie: świadectwo kalibracji, protokół, karta gwarancyjna, faktura albo inny. Fakturę widzi tylko właściciel, bo ma cenę.
_Avoid_: załącznik, teczka

**Przypomnienie o terminie**:
Wpis dzwonka tydzień przed terminem i raz po nim (przy gwarancji tylko przed), dla właściciela i kierownika lokalizacji, w której jest sprzęt.
_Avoid_: alarm (zarezerwowany dla progu dni)

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
Pakiet firmy z limitem liczby narzędzi. Konta nie wchodzą do limitu.

**Tryb tylko do odczytu**:
Stan firmy, w którym zapisy są zablokowane (poza czatem z supportem), a podgląd i eksport działają.
