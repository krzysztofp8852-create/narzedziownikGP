-- Cofnięcie ruchu z serwisu przywraca flagę „uszkodzone”.
--
-- Ruch z serwisu zdejmuje flagę (wyzwalacz z migracji zgłoszeń), a jego cofnięcie, jak każde, jest nowym ruchem
-- z odnośnikiem do oryginału, więc bez tej migracji narzędzie wracało do serwisu bez flagi, choć zgłoszenie
-- uszkodzenia było dalej otwarte. Narzędzie ruchu z serwisu zapamiętuje teraz datę flagi sprzed ruchu, a cofnięcie
-- ją przywraca. Zapamiętaną datę ustawia tylko wyzwalacz, także gdy ktoś poda ją przy zapisie; historia dalej
-- tylko się dopisuje, bo data powstaje razem z wierszem.

alter table app.movement_tools add column damaged_since_before timestamptz;

create function app.remember_damage_before_service() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.damaged_since_before := case
    when exists (select 1 from app.movements m where m.id = new.movement_id and m.kind = 'z_serwisu')
      then (select t.damaged_since from app.tools t where t.id = new.tool_id)
  end;
  return new;
end
$$;
revoke execute on function app.remember_damage_before_service() from public;

create trigger movement_tools_remember_damage before insert on app.movement_tools
  for each row execute function app.remember_damage_before_service();

-- Ruch z serwisu zdejmuje flagę, a jego cofnięcie przywraca tę sprzed ruchu. Narzędzie, które przed serwisem
-- flagi nie miało, zostaje takie, jakie jest (np. z nowym zgłoszeniem uszkodzenia sprzed cofnięcia).
create or replace function app.clear_damage_after_service() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  movement record;
begin
  select m.kind, m.reverses_movement_id, o.kind as reversed_kind into movement
  from app.movements m left join app.movements o on o.id = m.reverses_movement_id
  where m.id = new.movement_id;
  if movement.kind = 'z_serwisu' then
    update app.tools set damaged_since = null where id = new.tool_id;
  elsif movement.kind = 'cofniecie' and movement.reversed_kind = 'z_serwisu' then
    update app.tools t set damaged_since = coalesce(mt.damaged_since_before, t.damaged_since)
    from app.movement_tools mt
    where t.id = new.tool_id and mt.movement_id = movement.reverses_movement_id and mt.tool_id = new.tool_id;
  end if;
  return null;
end
$$;
