# 0022. Samouczek jako karta nad tablicą, a jego stan w app.users

Data: 2026-09-29 · Status: przyjęta

## Kontekst

Nowy właściciel, kierownik albo magazynier po pierwszym logowaniu ma dostać krótki samouczek (#32): właściciel listę
pierwszych kroków z postępem firmy, kierownik i magazynier samouczek zapisu ruchu. Można go pominąć i otworzyć
ponownie, a stan ma być zapamiętany na serwerze, nie tylko w przeglądarce. Demo ma już przewodnik po tablicy z dymkami przy
prawdziwych przyciskach (`DemoTour`), który pamięta stan w `localStorage`.

## Decyzja

- Stan to kolumna `app.users.tutorial`: brak wartości (samouczek startuje sam), `ukonczony` albo `pominiety`. Zmienia
  ją Rejestr tylko jako sama osoba (`users_update_self`), także w trybie tylko do odczytu, bo to sprawa aktora, a nie
  dane firmy. RLS pozwala też właścicielowi zmienić ją osobie z hasłem tymczasowym (`users_update_by_owner`), czego
  Rejestr nie robi i co niczego nie psuje.
  Migracja oznacza jako pominięty samouczek każdego, kto już zmienił hasło tymczasowe: pierwsze logowanie ma za sobą.
- Pierwsze kroki właściciela Rejestr liczy przy każdym odczycie ze stanu firmy (aktywny kierownik, budowa, narzędzie,
  wydrukowana naklejka), więc nie ma czego synchronizować. Kolejność: kierownik przed budową, bo budowa go wymaga.
  Kierownikiem budowy i pojazdu może być też sam właściciel, więc krok kierownika jest zrobiony także wtedy, gdy
  właściciel jest kierownikiem którejś budowy albo pojazdu.
- Samouczek to karta nad tablicą, a nie dymki przy przyciskach ani okno na cały ekran: nie zasłania tablicy (testy
  dymne i praca idą dalej), działa tak samo na telefonie i komputerze, a lista pierwszych kroków odsyła do prawdziwych
  formularzy. Ta sama karta jest pod `/samouczek`, dokąd prowadzi znak „?” w nagłówku (od #79 pozycja „Samouczek” w menu).
- Pracownik (nie rejestruje ruchów) i firma demo (własny przewodnik po tablicy, konto roli dzielą wszyscy oglądający) nie mają
  samouczka.

## Konsekwencje

- Samouczek nie zapisuje ruchów ani narzędzi; jedyny zapis to jego zamknięcie.
- Kopia tablicy w telefonie (ADR 0010) może mieć kartę samouczka sprzed jego zamknięcia, dopóki nie pobierze nowej.
- Karta nie wskazuje przycisków na tablicy; jeśli okaże się za mało, dymki z `DemoTour` można przenieść do samouczka.
