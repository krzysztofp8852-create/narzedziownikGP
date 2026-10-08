-- Powiadomienia w aplikacji na Androida przez Firebase Cloud Messaging (ADR 0038, #122).
--
-- Subskrypcja push ma rodzaj: przeglądarka (Web Push: adres subskrypcji i klucze, jak dotąd) albo aplikacja (token
-- rejestracji FCM). Dotychczasowe subskrypcje to przeglądarki. Każde urządzenie (adres albo token) należy najwyżej do
-- jednej osoby; reguły RLS (każdy widzi i usuwa tylko swoje) się nie zmieniają.

alter table app.push_subscriptions drop constraint push_subscriptions_pkey;
alter table app.push_subscriptions add column id uuid not null default gen_random_uuid() primary key;
alter table app.push_subscriptions add column kind text not null default 'przegladarka';
alter table app.push_subscriptions alter column kind drop default;
alter table app.push_subscriptions add column token text;
alter table app.push_subscriptions alter column endpoint drop not null;
alter table app.push_subscriptions alter column p256dh drop not null;
alter table app.push_subscriptions alter column auth drop not null;
alter table app.push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);
alter table app.push_subscriptions add constraint push_subscriptions_token_key unique (token);
alter table app.push_subscriptions add constraint push_subscriptions_kind_check check (
  (kind = 'przegladarka' and endpoint is not null and p256dh is not null and auth is not null and token is null)
  or (kind = 'aplikacja' and token is not null and endpoint is null and p256dh is null and auth is null)
);

-- Włączenie powiadomień w przeglądarce, jak dotąd; wiersz ma teraz rodzaj.
create or replace function app.save_push_subscription(
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
  insert into app.push_subscriptions (kind, endpoint, company_id, user_id, p256dh, auth, created_at)
  values ('przegladarka', p_endpoint, v_company_id, auth.uid(), p_p256dh, p_auth, p_created_at)
  on conflict (endpoint) do update
    set company_id = excluded.company_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, created_at = excluded.created_at;
end
$$;

-- Włączenie powiadomień w aplikacji: token FCM tej instalacji. Jak przy przeglądarce, telefon, który zmienił osobę,
-- przechodzi na aktora, a `insert … on conflict` wymagałby wglądu w cudzy wiersz, więc zapis idzie przez funkcję.
create function app.save_app_push_subscription(p_token text, p_created_at timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Powiadomienia włącza tylko aktywny użytkownik firmy';
  end if;
  insert into app.push_subscriptions (kind, token, company_id, user_id, created_at)
  values ('aplikacja', p_token, v_company_id, auth.uid(), p_created_at)
  on conflict (token) do update
    set company_id = excluded.company_id, user_id = excluded.user_id, created_at = excluded.created_at;
end
$$;
revoke execute on function app.save_app_push_subscription(text, timestamptz) from public;
grant execute on function app.save_app_push_subscription(text, timestamptz) to authenticated;
