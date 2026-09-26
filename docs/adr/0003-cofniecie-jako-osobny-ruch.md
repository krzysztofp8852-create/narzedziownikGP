# 0003. Cofnięcie to osobny rodzaj ruchu, a „cofnięty” wynika z odnośnika

Data: 2026-09-26 · Status: przyjęta

## Kontekst

Specyfikacja (#1) wymienia rodzaje ruchu bez cofnięcia i opisuje „znacznik »cofnięty« z odnośnikiem
do ruchu cofającego” na oryginale. Historia ruchów tylko się dopisuje, a wyzwalacz w bazie odrzuca
każdą zmianę zapisanego ruchu, więc ustawienie znacznika na oryginale wymagałoby wyjątku od tej zasady.

## Decyzja

- Cofnięcie zapisuje się jako nowy ruch rodzaju `cofniecie` z odnośnikiem `reverses_movement_id`
  do cofanego ruchu (najwyżej jedno cofnięcie na ruch).
- Oryginał jest „cofnięty”, gdy istnieje cofnięcie, które na niego wskazuje. Rejestr podaje to jako
  `undoneBy` (ruch) i `undone` (wpis historii na karcie narzędzia).
- Cofnięcie przywraca narzędziom lokalizację i „od X dni” sprzed cofniętego ruchu, jakby go nie było.

## Konsekwencje

- Zapisanego ruchu nie zmienia żadna ścieżka, także cofnięcie; historia jest w pełni dopisywana.
- W historii cofnięcie widać jako osobny wpis „Cofnięcie” obok przekreślonego oryginału.
- Okna 15 minut pilnuje Rejestr, bo czas zapisu pochodzi z jego zegara. Baza pilnuje autora,
  odwrotnego kierunku, braku późniejszych ruchów i objęcia wszystkich narzędzi oryginału.
