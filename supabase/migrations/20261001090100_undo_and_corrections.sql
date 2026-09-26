-- Cofnięcie, korekta, zaginięcie i wycofanie.
--
-- Historia dalej tylko się dopisuje. Cofnięcie to nowy ruch z odnośnikiem do
-- cofanego ruchu; „cofnięty” wynika z istnienia takiego ruchu, więc oryginału nie
-- trzeba zmieniać. Korekta, zaginięcie i wycofanie (tylko właściciel) zapisują
-- stan narzędzia przed i po ruchu oraz powód.

alter table app.movements
  add column reason text check (length(btrim(reason)) > 0),
  -- Stan narzędzia przed ruchem i po nim; przy wydaniu i zwrocie narzędzie jest w obiegu i w nim zostaje.
  add column from_state app.tool_state,
  add column to_state app.tool_state,
  add column reverses_movement_id uuid,
  -- Kto odpowiadał za narzędzie, które zaginęło: kierownik budowy, na której było.
  add column responsible_user_id uuid,
  add foreign key (company_id, reverses_movement_id) references app.movements (company_id, id),
  add foreign key (company_id, responsible_user_id) references app.users (company_id, user_id),
  add constraint movements_kind_fields check (
    (reverses_movement_id is not null) = (kind = 'cofniecie')
    and (from_state is not null and to_state is not null) = (kind in ('korekta', 'zaginiecie', 'wycofanie'))
    and (from_state is null or from_location_id is not null)
    and (kind <> 'zaginiecie' or to_state = 'zaginione')
    and (kind <> 'wycofanie' or to_state = 'wycofane')
    and (kind not in ('korekta', 'zaginiecie') or reason is not null)
    and (responsible_user_id is null or to_state = 'zaginione')
  );
-- Ruch cofa się najwyżej raz.
create unique index movements_reverses_once on app.movements (reverses_movement_id) where reverses_movement_id is not null;

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
        and exists (
          select 1 from app.locations l
          where l.id = to_location_id and l.kind = 'budowa' and l.status = 'aktywna'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
      when kind = 'zwrot' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id and l.kind = 'budowa'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      -- Cofnąć można tylko własny ruch, dokładnie w odwrotną stronę i nie na zakończoną budowę.
      -- Okna 15 minut pilnuje Rejestr: czas zapisu podaje jego zegar.
      when kind = 'cofniecie' then
        not exists (
          select 1 from app.locations l where l.id = movements.to_location_id and l.kind = 'budowa' and l.status <> 'aktywna'
        )
        and exists (
          select 1 from app.movements o
          where o.id = movements.reverses_movement_id
            and o.author_id = auth.uid()
            and o.kind in ('wydanie', 'zwrot')
            and o.from_location_id = movements.to_location_id
            and o.to_location_id = movements.from_location_id
        )
      when kind in ('korekta', 'zaginiecie', 'wycofanie') then app.current_user_role() = 'wlasciciel'
      else false
    end
  );

-- Przesuwa narzędzie tam, dokąd prowadzi ruch, i ustawia jego stan. Przyjęcie (bez
-- lokalizacji źródłowej) tylko potwierdza lokalizację, z którą narzędzie powstało.
-- Narzędzie musi być w lokalizacji źródłowej ruchu i w stanie sprzed ruchu (bez
-- podanego stanu: w obiegu), a przy wydaniu i zwrocie nie może mieć ruchu
-- późniejszego niż ten. Cofnięcie przywraca lokalizację i „od kiedy” sprzed
-- cofanego ruchu, pod warunkiem że był on ostatnim ruchem narzędzia. Inaczej błąd
-- GP409 wycofuje całą transakcję.
-- Narzędzia dopisuje się tylko w transakcji, w której powstał ruch: uprawnienia
-- sprawdzone przy zapisie ruchu nie obejmą później cudzej czy zakończonej budowy.
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
    set location_id = movement.to_location_id, located_since = restored_since
    where t.id = new.tool_id
      and t.location_id = movement.from_location_id
      and t.state = 'w_obiegu';
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

-- Cofnięcie obejmuje wszystkie narzędzia cofanego ruchu; sprawdzamy to przy zatwierdzeniu
-- transakcji, gdy narzędzia są już dopisane.
create function app.check_reversal_complete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select mt.tool_id from app.movement_tools mt where mt.movement_id = new.reverses_movement_id
    except
    select mt.tool_id from app.movement_tools mt where mt.movement_id = new.id
  ) then
    raise exception 'Cofnięcie % nie obejmuje wszystkich narzędzi ruchu %', new.id, new.reverses_movement_id;
  end if;
  return null;
end
$$;
revoke execute on function app.check_reversal_complete() from public;

create constraint trigger movements_reversal_complete after insert on app.movements
  deferrable initially deferred
  for each row when (new.kind = 'cofniecie') execute function app.check_reversal_complete();
