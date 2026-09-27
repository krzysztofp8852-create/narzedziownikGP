-- Kolejka offline: ruchy „Do wyjaśnienia”.
--
-- Telefon bez zasięgu trzyma ruchy w kolejce i wysyła je, gdy wróci sieć. Serwer może taki ruch
-- odrzucić (ktoś w międzyczasie przeniósł narzędzie, budowa ma innego kierownika albo jest zakończona).
-- Odrzucenie jest ostateczne: zapisuje się tu z powodem, ponowne wysłanie tej samej operacji zwraca je
-- zamiast próbować od nowa, a autor widzi je na liście „Do wyjaśnienia” na każdym urządzeniu.

alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony'));

create table app.rejected_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  author_id uuid not null,
  client_operation_id uuid not null,
  kind app.movement_kind not null,
  source app.movement_source not null,
  -- Co klient chciał zapisać; lokalizacje i narzędzia mogły w międzyczasie zniknąć z jego widoku.
  from_location_id uuid,
  to_location_id uuid,
  tool_ids uuid[] not null,
  occurred_at timestamptz not null,
  rejected_at timestamptz not null,
  -- Kod błędu Rejestru, np. movement_conflict, i przy konflikcie: gdzie są narzędzia i kto je przeniósł.
  reason text not null,
  conflicts jsonb not null default '[]',
  resolved_at timestamptz,
  sequence_number bigint generated always as identity,
  constraint rejected_movements_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, author_id) references app.users (company_id, user_id)
);
create index rejected_movements_author_idx on app.rejected_movements (author_id) where resolved_at is null;

alter table app.rejected_movements enable row level security;

grant select, insert on app.rejected_movements to authenticated;
grant update (resolved_at) on app.rejected_movements to authenticated;

-- Odrzucone ruchy widzi, zapisuje i wyjaśnia tylko ich autor.
create policy rejected_movements_own on app.rejected_movements for all to authenticated
  using (company_id = app.current_company_id() and author_id = auth.uid())
  with check (company_id = app.current_company_id() and author_id = auth.uid());

-- Powiadomienie o odrzuconym ruchu dostaje tylko jego autor, o własnym odrzuceniu.
create or replace function app.deliver_notification(
  p_recipient_id uuid, p_kind text, p_content jsonb, p_created_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
  v_dedupe_key text;
begin
  if v_company_id is null then
    raise exception 'Powiadomienie zapisuje tylko aktywny użytkownik firmy';
  end if;
  if p_kind = 'narzedzia_zabrane' then
    -- Przeniesienie aktora z budowy, którą prowadzi adresat.
    if not exists (
      select 1 from app.movements m join app.locations l on l.id = m.from_location_id
      where m.id = (p_content ->> 'movementId')::uuid and m.kind = 'przeniesienie'
        and m.author_id = auth.uid() and l.manager_id = p_recipient_id
    ) then
      raise exception 'Powiadomienie o zabranym sprzęcie tylko z własnego przeniesienia';
    end if;
    v_dedupe_key := 'ruch:' || (p_content ->> 'movementId');
  elsif p_kind = 'ruch_odrzucony' then
    if p_recipient_id <> auth.uid() or not exists (
      select 1 from app.rejected_movements r
      where r.id = (p_content ->> 'rejectionId')::uuid and r.author_id = auth.uid()
    ) then
      raise exception 'Powiadomienie o odrzuconym ruchu tylko dla autora, o jego odrzuceniu';
    end if;
    v_dedupe_key := 'odrzucony:' || (p_content ->> 'rejectionId');
  else
    raise exception 'Rodzaj powiadomienia % nie powstaje w transakcji użytkownika', p_kind;
  end if;
  insert into app.notifications (company_id, recipient_id, kind, content, dedupe_key, created_at)
  values (v_company_id, p_recipient_id, p_kind, p_content, v_dedupe_key, p_created_at)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end
$$;
