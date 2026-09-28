-- Tryb tylko do odczytu i limity progów.
--
-- Zapisy w trybie tylko do odczytu blokuje Rejestr (transakcja READ ONLY), bo granicę 14 dni po
-- „opłacone do” liczy jego zegar. Potrzebuje do tego stanu abonamentu także w transakcji kierownika
-- i magazyniera, a tabelę abonamentu (NIP, adres, płatności) widzi tylko właściciel. Dostają więc
-- tylko to, co blokuje zapisy i ostrzega o limicie: próg, „opłacone do”, tryb ręczny i liczbę narzędzi.

create function app.current_company_plan()
returns table (tier text, paid_until date, manual_read_only boolean, tools bigint)
language sql stable security definer set search_path = ''
as $$
  select s.tier, s.paid_until, s.manual_read_only,
         (select count(*) from app.tools t where t.company_id = s.company_id and t.state <> 'wycofane')
  from app.subscriptions s
  where s.company_id = app.current_company_id()
$$;

revoke execute on function app.current_company_plan() from public;
grant execute on function app.current_company_plan() to authenticated;

-- Ostrzeżenia przed trybem tylko do odczytu i samo przełączenie trafiają do dzwonka właściciela.
alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy', 'tylko_do_odczytu_wkrotce', 'tylko_do_odczytu'));

-- Ręczne włączenie trybu przez super-admina: powiadomienie aktywnych właścicieli firmy w jego
-- transakcji. Super-admin nie jest członkiem firmy i nie pisze do dzwonków wprost, więc zapis idzie
-- przez funkcję, która przyjmuje tylko ten rodzaj i tylko od super-admina.
create function app.notify_owners_of_read_only(p_company_id uuid, p_content jsonb, p_created_at timestamptz)
returns table (notification_id uuid, owner_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_super_admin() then
    raise exception 'Właścicieli o trybie tylko do odczytu powiadamia tylko super-admin';
  end if;
  if p_content ->> 'kind' is distinct from 'tylko_do_odczytu' then
    raise exception 'Nieznany rodzaj powiadomienia o abonamencie';
  end if;
  return query
    with inserted as (
      insert into app.notifications (company_id, recipient_id, kind, content, created_at)
      select p_company_id, u.user_id, 'tylko_do_odczytu', p_content, p_created_at
      from app.users u
      where u.company_id = p_company_id and u.role = 'wlasciciel' and u.active
      returning id, recipient_id
    )
    select i.id, i.recipient_id from inserted i;
end
$$;

revoke execute on function app.notify_owners_of_read_only(uuid, jsonb, timestamptz) from public;
grant execute on function app.notify_owners_of_read_only(uuid, jsonb, timestamptz) to authenticated;
