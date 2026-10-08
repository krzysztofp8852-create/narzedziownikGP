-- Jeden pakiet zamiast progu abonamentu i pakietu wdrożenia (ADR 0040): mały, średni albo duży, każdy z ceną wdrożenia,
-- opłatą roczną, limitem osób zapisujących ruchy i limitem narzędzi. Pakiety i ich limity zna Rejestr
-- (src/registry/subscriptions.ts), a pakiet firmy to `tier`.
--
-- Firma dostaje wyższy z dwóch dotychczasowych progów (plan indywidualny to duży), więc żaden limit jej się nie obniża.
-- Kolumna `implementation_tier` zostaje bez użycia dla wersji aplikacji sprzed pakietów, dopóki działa po migracji;
-- usunie ją kolejna migracja.

update app.subscriptions set tier = case
  when tier in ('duzy', 'indywidualny') or implementation_tier = 'duzy' then 'duzy'
  when tier = 'sredni' or implementation_tier = 'sredni' then 'sredni'
  else 'maly'
end;

alter table app.subscriptions drop constraint subscriptions_tier_check;
alter table app.subscriptions add constraint subscriptions_tier_check check (tier in ('maly', 'sredni', 'duzy'));
