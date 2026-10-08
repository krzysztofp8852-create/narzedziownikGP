# 0040. Jeden pakiet zamiast progu abonamentu i pakietu wdrożenia

Data: 2026-10-08 · Status: przyjęta (zastępuje pakiety i ceny z ADR 0024)

## Kontekst

Firma miała dwa niezależne wybory: próg abonamentu z limitem narzędzi (mały, średni, duży i plan indywidualny, od
300 zł za rok) i pakiet wdrożenia z limitem osób zapisujących ruchy (do 2, 3–6 albo 7 i więcej osób, od 3000 zł).
Cennik na stronie pokazywał je osobno, a klient musiał złożyć ofertę z dwóch tabel. GP Engineering sprzedaje teraz trzy
gotowe pakiety, każdy z ceną wdrożenia i opłatą za utrzymanie.

## Decyzja

- **Pakiet** łączy oba wybory. Rejestr zna pakiety (`TIERS`), każdy z ceną wdrożenia, opłatą za rok, limitem osób
  zapisujących ruchy i limitem narzędzi:

  | Pakiet | Wdrożenie | Za rok  | Osoby zapisujące ruchy | Narzędzia  |
  | ------ | --------- | ------- | ---------------------- | ---------- |
  | Mały   | 3000 zł   | 400 zł  | do 5                   | do 150     |
  | Średni | 6000 zł   | 800 zł  | do 30                  | do 500     |
  | Duży   | 12000 zł  | 2000 zł | bez limitu             | bez limitu |

- Pakiet firmy to `app.subscriptions.tier`; super-admin wybiera jeden pakiet przy zakładaniu firmy i zmienia go na
  karcie firmy. Planu indywidualnego nie ma: firma ponad limit narzędzi średniego pakietu dostaje propozycję dużego.
- Limity działają jak dotąd: limit osób blokuje dodanie kierownika albo magazyniera (ADR 0024), a limit narzędzi tylko
  ostrzega. Dopłata do wyższego pakietu przy braku miejsc to różnica cen wdrożenia.
- Migracja daje każdej firmie wyższy z dwóch dotychczasowych progów (plan indywidualny to duży), więc żadnej limit się
  nie obniża. Firmy zakładane skryptem i firma demo mają duży pakiet.
- Kolumna `implementation_tier` zostaje bez użycia, dopóki po migracji może działać wersja aplikacji sprzed zmiany;
  usunie ją kolejna migracja.
- Cennik na stronie o programie pokazuje trzy karty pakietów; mały jest wyróżniony jako najpopularniejszy wśród małych
  firm. Osoby zapisujące ruchy cennik nazywa osobami decyzyjnymi, z dopiskiem, że liczy się też właściciel.

## Konsekwencje

- Firma, która potrzebuje wielu osób, ale mało narzędzi (albo odwrotnie), płaci za pakiet według większej z tych
  potrzeb. Gdyby to blokowało sprzedaż, trzeba by wrócić do dwóch osobnych wyborów.
- Regulamin opisuje abonament jako próg zależny od liczby narzędzi; jego zmiana to osobna decyzja z powiadomieniem
  klientów.
