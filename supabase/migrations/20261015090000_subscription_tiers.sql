-- Progi według cennika rocznego i abonament widoczny tylko dla właściciela.
--
-- Plan indywidualny (ponad 1000 narzędzi) nie ma limitu, a cenę ustalamy osobno. Abonament ma dane do
-- faktury (NIP, adres) i płatności, więc z firmy widzi go tylko właściciel.

alter table app.subscriptions drop constraint subscriptions_tier_check;
alter table app.subscriptions add constraint subscriptions_tier_check
  check (tier in ('maly', 'sredni', 'duzy', 'indywidualny'));

drop policy subscriptions_select on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select to authenticated
  using ((company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel') or app.is_super_admin());
