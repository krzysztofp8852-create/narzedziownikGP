-- Pakiet wdrożenia firmy: wyznacza limit osób zapisujących ruchy (aktywni właściciele, kierownicy i magazynierzy).
--
-- Pakiety i ich limity zna Rejestr (src/registry/subscriptions.ts), a limit pilnuje dodawanie osoby w zespole (ADR 0024).
-- Istniejące firmy zapłaciły dotychczasowe wdrożenie 5000 zł, więc dostają duży pakiet, bez limitu. Domyślny duży
-- zostaje też dla wersji aplikacji sprzed pakietów, która zakłada firmy bez tej kolumny, dopóki działa po migracji.

alter table app.subscriptions add column implementation_tier text not null default 'duzy'
  check (implementation_tier in ('maly', 'sredni', 'duzy'));

grant update (implementation_tier) on app.subscriptions to authenticated;
