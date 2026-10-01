-- Sprzęt wynajęty z wypożyczalni (ADR 0030).
--
-- Narzędzie wynajęte ma nazwę wypożyczalni (`rented_from`, ustawiana tylko przy przyjęciu), stawkę dobową z umowy
-- (app.rental_rates, widzi ją ten, kto widzi koszty narzędzia) i termin zwrotu (rodzaj terminu `zwrot`). Przyjmuje je
-- od razu w lokalizacji, w której stoi, właściciel i magazynier wszędzie, a kierownik na swojej aktywnej budowie albo
-- pojeździe, bez akceptacji. Właściciel dostaje wpis w dzwonku. Wynajęte nie liczy się do limitu narzędzi progu.
--
-- Zwrot do wypożyczalni to ruch bez lokalizacji docelowej, który przenosi narzędzie w stan „zwrócone”: znika z tablicy,
-- a zostaje w historii. Zapisuje go właściciel, magazynier albo kierownik lokalizacji, w której sprzęt stoi; ci sami
-- przedłużają wynajem, zmieniając termin zwrotu. Cofnięcie zwrotu to ruch w tej samej lokalizacji, który przywraca
-- stan „w obiegu”.

alter table app.tools
  add column rented_from text check (rented_from is null or (length(btrim(rented_from)) > 0 and length(rented_from) <= 100)),
  add constraint tools_returned_rented check (state <> 'zwrocone' or rented_from is not null);

create table app.rental_rates (
  tool_id uuid primary key,
  company_id uuid not null,
  -- Stawka dobowa z umowy w zł.
  amount numeric(12, 2) not null check (amount >= 0),
  recorded_at timestamptz not null,
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);

alter table app.rental_rates enable row level security;
grant select, insert on app.rental_rates to authenticated;

-- Czy aktor obsługuje wynajem sprzętu w tej lokalizacji: właściciel i magazynier wszędzie, kierownik na swojej budowie
-- albo pojeździe.
create function app.handles_rentals_at(p_location_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.current_user_role() in ('wlasciciel', 'magazynier') or app.moves_tools_of(p_location_id)
$$;
revoke execute on function app.handles_rentals_at(uuid) from public;
grant execute on function app.handles_rentals_at(uuid) to authenticated;

-- …i czy obsługuje wynajem tego narzędzia (wynajętego, w obiegu, tam, gdzie teraz stoi).
create function app.handles_rental_of(p_tool_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.tools t
    where t.id = p_tool_id and t.company_id = app.current_company_id() and t.rented_from is not null and t.state = 'w_obiegu'
      and app.handles_rentals_at(t.location_id)
  )
$$;
revoke execute on function app.handles_rental_of(uuid) from public;
grant execute on function app.handles_rental_of(uuid) to authenticated;

create policy rental_rates_select on app.rental_rates for select to authenticated
  using (company_id = app.current_company_id() and app.sees_costs_of_tool(tool_id));
create policy rental_rates_insert on app.rental_rates for insert to authenticated
  with check (company_id = app.current_company_id() and app.handles_rental_of(tool_id));

-- Kierownik dopisuje wynajęte narzędzie w obiegu na swojej aktywnej budowie albo pojeździe…
create policy tools_insert_rental on app.tools for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.current_user_role() = 'kierownik'
    and rented_from is not null
    and registration = 'zaakceptowane'
    and state = 'w_obiegu'
    and app.is_open_site_or_vehicle(location_id)
    and app.moves_tools_of(location_id)
  );

-- …i zapisuje jego przyjęcie tam. Zgłoszenie narzędzia (tylko na budowę) ma własną politykę. Do przyjęcia dopisuje się
-- tylko narzędzie powstałe w tej samej transakcji (app.check_intake_tool), a kierownik dopisuje na pojeździe tylko
-- wynajęte.
create policy movements_insert_rental on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and kind = 'przyjecie'
    and from_location_id is null
    and app.current_user_role() = 'kierownik'
    and app.is_open_site_or_vehicle(to_location_id)
    and app.moves_tools_of(to_location_id)
  );

-- Zwrot do wypożyczalni zmienia stan na „zwrócone” bez lokalizacji docelowej; jego cofnięcie przywraca „w obiegu”.
alter table app.movements drop constraint movements_kind_fields;
alter table app.movements add constraint movements_kind_fields check (
  (
    (from_state is not null and to_state is not null) = (kind in ('korekta', 'zaginiecie', 'wycofanie', 'zwrot_do_wypozyczalni'))
    or (kind = 'cofniecie' and from_state = 'zwrocone' and to_state = 'w_obiegu')
  )
  and (reverses_movement_id is not null) = (kind = 'cofniecie')
  and (from_state is null or from_location_id is not null)
  and (kind <> 'zaginiecie' or to_state = 'zaginione')
  and (kind <> 'wycofanie' or to_state = 'wycofane')
  and (kind <> 'zwrot_do_wypozyczalni' or (from_state = 'w_obiegu' and to_state = 'zwrocone' and to_location_id is null))
  and (kind not in ('korekta', 'zaginiecie') or reason is not null)
  and (responsible_user_id is null or to_state = 'zaginione')
);

drop policy movements_insert on app.movements;
create policy movements_insert on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and case
      when kind = 'przyjecie' then
        from_location_id is null
        and app.current_user_role() in ('wlasciciel', 'magazynier')
      when kind = 'wydanie' then
        exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'baza')
        and app.is_open_site_or_vehicle(to_location_id)
        and app.moves_tools_of(to_location_id)
      when kind = 'zwrot' then
        app.moves_tools_of(from_location_id)
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      when kind = 'przeniesienie' then
        from_location_id <> to_location_id
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind in ('budowa', 'pojazd'))
        and app.is_open_site_or_vehicle(to_location_id)
        and app.moves_tools_of(to_location_id)
      when kind = 'do_serwisu' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id
            and (
              (app.current_user_role() in ('wlasciciel', 'magazynier') and l.kind in ('baza', 'budowa'))
              or (l.kind = 'budowa' and l.manager_id = auth.uid())
            )
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'serwis')
      when kind = 'z_serwisu' then
        app.current_user_role() in ('wlasciciel', 'magazynier')
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'serwis')
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      when kind = 'zwrot_do_wypozyczalni' then
        to_location_id is null and app.handles_rentals_at(from_location_id)
      -- Cofnąć można tylko własny ruch, dokładnie w odwrotną stronę (zwrot do wypożyczalni: w tej samej lokalizacji)
      -- i nie na zakończoną budowę ani nieaktywny pojazd. Okna 15 minut pilnuje Rejestr: czas zapisu podaje jego zegar.
      when kind = 'cofniecie' then
        not exists (
          select 1 from app.locations l
          where l.id = movements.to_location_id
            and ((l.kind = 'budowa' and l.status <> 'aktywna') or (l.kind = 'pojazd' and not l.active))
        )
        and exists (
          select 1 from app.movements o
          where o.id = movements.reverses_movement_id
            and o.author_id = auth.uid()
            and o.from_location_id = movements.to_location_id
            and (
              (o.kind in ('wydanie', 'zwrot', 'przeniesienie', 'do_serwisu', 'z_serwisu') and o.to_location_id = movements.from_location_id)
              or (o.kind = 'zwrot_do_wypozyczalni' and movements.from_location_id = movements.to_location_id)
            )
        )
      when kind in ('korekta', 'zaginiecie', 'wycofanie') then app.current_user_role() = 'wlasciciel'
      else false
    end
  );

-- Jak dotąd, a cofnięcie z podanym stanem (cofnięcie zwrotu do wypożyczalni) przywraca też stan sprzed ruchu.
create or replace function app.apply_movement_to_tool() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  movement record;
  restored_since timestamptz;
begin
  select m.kind, m.from_location_id, m.to_location_id, m.from_state, m.to_state, m.occurred_at,
         m.reverses_movement_id, m.xmin = pg_current_xact_id()::xid as is_new
  into movement
  from app.movements m where m.id = new.movement_id;
  if not movement.is_new then
    raise exception 'Do zapisanego ruchu % nie można dopisać narzędzi', new.movement_id;
  end if;
  if movement.from_location_id is null then
    return new;
  end if;

  if movement.kind = 'cofniecie' then
    -- Od cofanego ruchu nie ruszyło się żadne z jego narzędzi (poza samym cofnięciem).
    if not exists (select 1 from app.movement_tools mt where mt.movement_id = movement.reverses_movement_id and mt.tool_id = new.tool_id)
       or exists (
         select 1 from app.movement_tools mt
         join app.movement_tools later on later.tool_id = mt.tool_id
         join app.movements lm on lm.id = later.movement_id
         where mt.movement_id = movement.reverses_movement_id
           and later.movement_id <> new.movement_id
           and lm.sequence_number > (select o.sequence_number from app.movements o where o.id = movement.reverses_movement_id)
       ) then
      raise exception 'Narzędzie % ruszyło się po ruchu % albo nie było w nim; nie jest w stanie sprzed ruchu', new.tool_id,
        movement.reverses_movement_id using errcode = 'GP409';
    end if;
    -- Czas ostatniego ruchu, który nie jest cofnięciem ani nie został cofnięty (także tym).
    select m.occurred_at into restored_since
    from app.movement_tools mt join app.movements m on m.id = mt.movement_id
    where mt.tool_id = new.tool_id and m.kind <> 'cofniecie'
      and not exists (select 1 from app.movements u where u.reverses_movement_id = m.id)
    order by m.sequence_number desc limit 1;
    update app.tools t
    set location_id = movement.to_location_id, located_since = restored_since, state = coalesce(movement.to_state, t.state)
    where t.id = new.tool_id
      and t.location_id = movement.from_location_id
      and t.state = coalesce(movement.from_state, 'w_obiegu');
  else
    update app.tools t
    set location_id = coalesce(movement.to_location_id, t.location_id),
        state = coalesce(movement.to_state, t.state),
        located_since = movement.occurred_at
    where t.id = new.tool_id
      and t.location_id = movement.from_location_id
      and t.state = coalesce(movement.from_state, 'w_obiegu')
      and (movement.from_state is not null or t.located_since <= movement.occurred_at);
  end if;
  if not found then
    raise exception 'Narzędzie % nie jest w lokalizacji źródłowej ani w stanie sprzed ruchu %', new.tool_id, new.movement_id
      using errcode = 'GP409';
  end if;
  return new;
end
$$;

-- Do wypożyczalni wraca tylko sprzęt wynajęty.
create function app.check_rental_return_tool() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.movements m where m.id = new.movement_id and m.kind = 'zwrot_do_wypozyczalni')
     and not exists (select 1 from app.tools t where t.id = new.tool_id and t.rented_from is not null) then
    raise exception 'Do wypożyczalni wraca tylko sprzęt wynajęty, a narzędzie % nie jest wynajęte', new.tool_id;
  end if;
  return new;
end
$$;
revoke execute on function app.check_rental_return_tool() from public;

create trigger movement_tools_rental_return before insert on app.movement_tools
  for each row execute function app.check_rental_return_tool();

-- Termin zwrotu: jak gwarancja jest zawsze datą, bez cyklu i wykonania. Dodaje go przyjęcie sprzętu wynajętego,
-- a zmieniają (przedłużenie) ci, którzy obsługują wynajem tego narzędzia.
alter table app.tool_deadlines drop constraint tool_deadlines_kind_check;
alter table app.tool_deadlines add constraint tool_deadlines_kind_check check (kind in ('przeglad', 'kalibracja', 'udt', 'gwarancja', 'zwrot'));
alter table app.tool_deadlines add constraint tool_deadlines_return check (
  kind <> 'zwrot' or (due_on is not null and cycle_months is null and last_done_on is null)
);

create policy tool_deadlines_insert_return on app.tool_deadlines for insert to authenticated
  with check (company_id = app.current_company_id() and kind = 'zwrot' and app.handles_rental_of(tool_id));
create policy tool_deadlines_update_return on app.tool_deadlines for update to authenticated
  using (company_id = app.current_company_id() and kind = 'zwrot' and app.handles_rental_of(tool_id))
  with check (company_id = app.current_company_id() and kind = 'zwrot');

-- Wynajęte nie liczy się do limitu narzędzi progu.
create or replace function app.current_company_plan()
returns table (tier text, paid_until date, manual_read_only boolean, tools bigint)
language sql stable security definer set search_path = ''
as $$
  select s.tier, s.paid_until, s.manual_read_only,
         (select count(*) from app.tools t where t.company_id = s.company_id and t.state <> 'wycofane' and t.rented_from is null)
  from app.subscriptions s
  where s.company_id = app.current_company_id()
$$;

create or replace function app.company_tool_counts() returns table (company_id uuid, tools bigint)
language sql stable security definer set search_path = ''
as $$
  select t.company_id, count(*) from app.tools t
  where t.state <> 'wycofane' and t.rented_from is null and app.is_super_admin()
  group by t.company_id
$$;

-- Właściciel dostaje w dzwonku wpis o przyjętym sprzęcie wynajętym.
alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy', 'tylko_do_odczytu_wkrotce', 'tylko_do_odczytu', 'terminy',
                  'sprzet_wynajety'));

create or replace function app.deliver_notification(
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
  elsif p_kind = 'sprzet_wynajety' then
    -- Właściciel firmy, o sprzęcie wynajętym, którego przyjęcie zapisał aktor.
    if not exists (
      select 1 from app.users u where u.user_id = p_recipient_id and u.company_id = v_company_id and u.role = 'wlasciciel'
    ) or not exists (
      select 1 from app.tools t
      join app.movement_tools mt on mt.tool_id = t.id
      join app.movements m on m.id = mt.movement_id
      where t.id = (p_content -> 'tool' ->> 'id')::uuid and t.rented_from is not null
        and m.kind = 'przyjecie' and m.author_id = auth.uid()
    ) then
      raise exception 'Powiadomienie o sprzęcie wynajętym tylko dla właściciela, o własnym przyjęciu';
    end if;
    v_dedupe_key := 'wynajem:' || (p_content -> 'tool' ->> 'id');
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
