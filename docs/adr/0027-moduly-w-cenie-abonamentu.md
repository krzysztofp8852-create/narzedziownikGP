# 0027. Moduły zarządzania budową w cenie abonamentu, zawsze włączone

Data: 2026-10-01 · Status: przyjęta

## Kontekst

Spec #78 rozszerza program poza ewidencję sprzętu: menu, koszt sprzętu ze sprzętem wynajętym, kartoteka Ludzie
z uprawnieniami, odbijanie na budowie i flota. Celem jest zdobycie nowych klientów i zatrzymanie obecnych, a nie
dosprzedaż. Do wyboru było sprzedawanie modułów osobno (włączane w firmie, z własną opłatą) albo dodanie ich
wszystkim w obecnej cenie.

## Decyzja

- **Moduł** to część programu z własną podstroną albo zakładką, w cenie abonamentu i zawsze włączona u każdej firmy,
  także w firmie demo. Nie ma przełącznika modułów w firmie ani w panelu super-admina. Cennik progów i wdrożenia się
  nie zmienia.
- Moduły rozszerzają obecne pojęcia (budowa, pojazd, terminy, ruchy, ustawienia firmy) zamiast tworzyć osobne
  aplikacje: koszt sprzętu to zakładka „Koszty” na stronie budowy i pojazdu, liczona z historii ruchów.
- Reguły modułów żyją w Rejestrze, a uprawnienia ról pilnuje RLS, jak w całym programie. Każdy zapis modułu idzie
  przez transakcję Rejestru, więc tryb tylko do odczytu (ADR 0013) blokuje go tak samo.
- `demo:create` uzupełnia dane każdego modułu, kiedy moduł wchodzi, żeby oglądający widział go z przykładowymi danymi.

## Konsekwencje

- Etapu nie da się udostępnić jednej firmie na próbę: trafia na produkcję do wszystkich naraz. Moduły, które dotykają
  nowych kategorii danych osobowych (Ludzie, odbijanie), czekają na poprawkę umowy powierzenia i polityki prywatności.
- Program łatwiej sprzedać firmie, której sama ewidencja nie wystarcza, ale moduły nie dają osobnego przychodu.
  Gdyby trzeba było je wyceniać osobno, potrzebny będzie przełącznik w firmie i nowa decyzja.
