# 0036. Czas na budowie liczony z odbić, z przejściem do chwili skanu

Data: 2026-10-02 · Status: przyjęta

## Kontekst

Właściciel chce przekazać księgowej, kto był na której budowie i ile godzin, bez kartki kierownika (#78, #91).
Odbicie to pobyt od wejścia do wyjścia (ADR 0032), odbicie bez wyjścia nie ma prawdziwej godziny wyjścia (ADR 0035),
a przejście na inną budowę to jeden skan na nowej budowie: program nie wie, kiedy osoba wyjechała z poprzedniej.
Zestawienie nie może sugerować, że zastępuje kadry.

## Decyzja

- **Czas na budowie** to suma odbić od wejścia do wyjścia (wyjście skanem, przejście albo wyjście uzupełnione
  poprawką). Odbicie bez wyjścia i odbicie trwające teraz nie liczą się wcale; lista pokazuje tylko, ile jest odbić
  bez wyjścia.
- **Przejście** kończy pobyt na poprzedniej budowie w chwili skanu na nowej, tak jak pokazuje go zakładka „Ludzie na
  budowie”. Przejście daje dwa osobne wpisy, nic się nie dubluje. Dojazd nie liczy się, gdy osoba odbije wyjście
  z poprzedniej budowy, a potem wejście na następną: przerwa między odbiciami nie należy do żadnej budowy. Zmiana
  przejścia (np. pytanie o godzinę wyjazdu) to osobna decyzja.
- **Miesiąc w Polsce**: odbicie przez północ na granicy miesiąca liczy się w każdym miesiącu tylko w swojej części.
- Zapytania w Rejestrze: `timeOnSiteSummary(miesiąc)` (osoba × budowa i baza, z sumami; właściciel całą firmę,
  kierownik budowy, których jest kierownikiem) i `ownTimeOnSite()` (własne odbicia i sumy w bieżącym i poprzednim
  miesiącu, dla każdego z kontem). Pracownik i magazynier nie mają zestawienia firmy.
- Strona „Czas na budowie” (`/czas`, grupa „Ludzie” menu) z eksportem do Excela (`/czas/eksport`, godziny dziesiętne
  z dwoma miejscami po przecinku). Program nazywa to czasem na budowie, nigdy ewidencją czasu pracy.

## Konsekwencje

- Kto przejeżdża między budowami jednym skanem, ma dojazd w czasie poprzedniej budowy. Kierownik może to poprawić
  poprawką odbicia (wyjście jest godziną przejścia).
- Zestawienie liczy się za każdym razem z odbić, więc poprawka odbicia od razu zmienia sumy, także zamkniętych miesięcy.
- Kierownik widzi tylko budowy, których jest kierownikiem teraz; po zmianie kierownika budowy jej zestawienie przechodzi
  na nowego.
