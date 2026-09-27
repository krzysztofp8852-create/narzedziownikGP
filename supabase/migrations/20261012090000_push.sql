-- Powiadomienia push: subskrypcje Web Push przeglądarek użytkowników firmy.
--
-- Push jest kopią wpisu z dzwonka, wysyłaną po zapisie, tak jak e-mail. Każda przeglądarka (adres
-- subskrypcji w usłudze push) należy najwyżej do jednej osoby, a wygasłe subskrypcje serwer usuwa.

create table app.push_subscriptions (
  endpoint text primary key,
  company_id uuid not null references app.companies (id) on delete restrict,
  user_id uuid not null,
  -- Klucze szyfrowania treści z subskrypcji przeglądarki (base64url).
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null,
  foreign key (company_id, user_id) references app.users (company_id, user_id)
);
create index push_subscriptions_user_idx on app.push_subscriptions (user_id);

alter table app.push_subscriptions enable row level security;

grant select, delete on app.push_subscriptions to authenticated;

-- Każdy widzi i usuwa tylko subskrypcje swoich przeglądarek. Wysyłka czyta je w transakcji systemowej.
create policy push_subscriptions_select on app.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_subscriptions_delete on app.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Włączenie powiadomień w przeglądarce. Gdy ta sama przeglądarka była subskrypcją kogoś innego (wspólny
-- telefon, zmiana osoby bez wylogowania), przechodzi na aktora: `insert … on conflict` wymagałby wglądu
-- w cudzy wiersz, więc zapis idzie przez funkcję. Adres subskrypcji zna tylko przeglądarka, w której ją
-- utworzono.
create function app.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_created_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Powiadomienia włącza tylko aktywny użytkownik firmy';
  end if;
  insert into app.push_subscriptions (endpoint, company_id, user_id, p256dh, auth, created_at)
  values (p_endpoint, v_company_id, auth.uid(), p_p256dh, p_auth, p_created_at)
  on conflict (endpoint) do update
    set company_id = excluded.company_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, created_at = excluded.created_at;
end
$$;
revoke execute on function app.save_push_subscription(text, text, text, timestamptz) from public;
grant execute on function app.save_push_subscription(text, text, text, timestamptz) to authenticated;

-- Zapis powiadomienia w transakcji użytkownika zwraca jego identyfikator (null, gdy adresat już je ma),
-- żeby kopię push dostał tylko nowy wpis dzwonka.
drop function app.deliver_notification(uuid, text, jsonb, timestamptz);
create function app.deliver_notification(
  p_recipient_id uuid, p_kind text, p_content jsonb, p_created_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
  v_dedupe_key text;
  v_id uuid;
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
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function app.deliver_notification(uuid, text, jsonb, timestamptz) from public;
grant execute on function app.deliver_notification(uuid, text, jsonb, timestamptz) to authenticated;
