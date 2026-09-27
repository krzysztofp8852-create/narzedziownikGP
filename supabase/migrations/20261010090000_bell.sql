-- Dzwonek: skrzynka powiadomień każdego użytkownika firmy.
--
-- Powiadomienie zapisuje się w tej samej transakcji co zdarzenie, z którego wynika (np. ruch),
-- więc nie przepada i nie powtarza się. E-mail i push są tylko jego kopią, wysyłaną po zapisie.
-- Treść to dane zdarzenia z tamtej chwili (kto, co, skąd), a tekst składa interfejs.

create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  recipient_id uuid not null,
  kind text not null check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone')),
  content jsonb not null,
  -- To samo zdarzenie (ruch, przekroczenie progu) daje adresatowi najwyżej jedno powiadomienie.
  dedupe_key text,
  created_at timestamptz not null,
  read_at timestamptz,
  foreign key (company_id, recipient_id) references app.users (company_id, user_id)
);
create index notifications_recipient_idx on app.notifications (recipient_id, created_at desc);
create unique index notifications_once_per_event on app.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

alter table app.notifications enable row level security;

grant select on app.notifications to authenticated;
grant update (read_at) on app.notifications to authenticated;

-- Każdy widzi i oznacza jako przeczytane tylko swoje powiadomienia.
create policy notifications_select on app.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on app.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Zapis w transakcji zdarzenia: ktoś z firmy (np. ten, kto zabrał sprzęt) dopisuje powiadomienie
-- innej osobie z tej samej firmy. Pominięcie zdarzenia, które adresat już ma, wymagałoby wglądu
-- w jego dzwonek, więc zapis idzie przez funkcję, która sama ustala firmę aktora; klucz obcy pilnuje,
-- że adresat jest z tej firmy. Zadania systemowe (poza RLS) piszą do tabeli wprost.
create function app.deliver_notification(
  p_recipient_id uuid, p_kind text, p_content jsonb, p_dedupe_key text, p_created_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Powiadomienie zapisuje tylko aktywny użytkownik firmy';
  end if;
  insert into app.notifications (company_id, recipient_id, kind, content, dedupe_key, created_at)
  values (v_company_id, p_recipient_id, p_kind, p_content, p_dedupe_key, p_created_at)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end
$$;
revoke execute on function app.deliver_notification(uuid, text, jsonb, text, timestamptz) from public;
grant execute on function app.deliver_notification(uuid, text, jsonb, text, timestamptz) to authenticated;

-- Przekroczenia progu dni wykryte przez zadanie dzienne: pobyt narzędzia w lokalizacji (od
-- located_since) przekracza próg najwyżej raz, więc następnego dnia powiadomienie się nie powtarza.
-- Tylko dla zadań systemowych: `authenticated` nie ma do tabeli żadnych uprawnień.
create table app.threshold_alerts (
  tool_id uuid not null,
  company_id uuid not null,
  located_since timestamptz not null,
  detected_at timestamptz not null,
  primary key (tool_id, located_since),
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);
alter table app.threshold_alerts enable row level security;
