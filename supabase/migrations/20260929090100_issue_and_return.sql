-- Wydanie z bazy i zwrot na bazę.
--
-- Kto może zapisać ruch, pilnuje RLS na app.movements: kierownik wydaje tylko na
-- swoją aktywną budowę i zwraca tylko ze swojej, magazynier i właściciel dla
-- wszystkich budów. Bieżącą lokalizację narzędzia (projekcję historii) przesuwa
-- wyzwalacz przy dopisaniu narzędzia do ruchu, w tej samej transakcji. Jeśli
-- narzędzie nie jest tam, skąd ruch je zabiera, cały ruch się wycofuje.

-- Każdy rodzaj ruchu ma swoją parę lokalizacji i swoje uprawnienia.
drop policy movements_insert on app.movements;
create policy movements_insert on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and case kind
      when 'przyjecie' then
        from_location_id is null
        and app.current_user_role() in ('wlasciciel', 'magazynier')
      when 'wydanie' then
        exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'baza')
        and exists (
          select 1 from app.locations l
          where l.id = to_location_id and l.kind = 'budowa' and l.status = 'aktywna'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
      when 'zwrot' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id and l.kind = 'budowa'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      else false
    end
  );

-- Narzędzia dopisuje do ruchu tylko jego autor.
drop policy movement_tools_insert on app.movement_tools;
create policy movement_tools_insert on app.movement_tools for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and exists (select 1 from app.movements m where m.id = movement_id and m.author_id = auth.uid())
  );

-- Przesuwa narzędzie tam, dokąd prowadzi ruch. Przyjęcie (bez lokalizacji
-- źródłowej) tylko potwierdza lokalizację, z którą narzędzie powstało. Narzędzie
-- musi być w obiegu, w lokalizacji źródłowej ruchu i nie może mieć ruchu
-- późniejszego niż ten; inaczej błąd GP409 wycofuje całą transakcję.
create function app.apply_movement_to_tool() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  movement record;
begin
  select m.from_location_id, m.to_location_id, m.occurred_at into movement
  from app.movements m where m.id = new.movement_id;
  if movement.from_location_id is null then
    return new;
  end if;
  update app.tools t
  set location_id = movement.to_location_id, located_since = movement.occurred_at
  where t.id = new.tool_id
    and t.location_id = movement.from_location_id
    and t.state = 'w_obiegu'
    and t.located_since <= movement.occurred_at;
  if not found then
    raise exception 'Narzędzie % nie jest w lokalizacji źródłowej ruchu %', new.tool_id, new.movement_id
      using errcode = 'GP409';
  end if;
  return new;
end
$$;
revoke execute on function app.apply_movement_to_tool() from public;

create trigger movement_tools_apply after insert on app.movement_tools
  for each row execute function app.apply_movement_to_tool();

-- Kolejność zapisu rozstrzyga ruchy z tym samym czasem zdarzenia i zapisu.
alter table app.movements add column sequence_number bigint generated always as identity;
create index movements_occurred_at_idx on app.movements (company_id, occurred_at desc, recorded_at desc, sequence_number desc);
