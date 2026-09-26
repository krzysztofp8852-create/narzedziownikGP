-- Zgłoszenia narzędzi: kierownik dopisuje do ewidencji sprzęt kupiony na swoją budowę.
--
-- Zgłoszone narzędzie od razu jest na budowie zgłaszającego (ruch `przyjecie` jego
-- autorstwa) i uczestniczy w ruchach jak każde inne. Właściciel akceptuje zgłoszenie
-- (status ewidencji `zaakceptowane`, kod i wartość) albo odrzuca je wycofaniem
-- z komentarzem. Uprawnienia kierownika to osobne polityki: polityki tego samego
-- polecenia łączy „lub”, więc dotychczasowe zostają bez zmian.

-- Kierownik dopisuje tylko zgłoszone narzędzie w obiegu, na swojej aktywnej budowie.
create policy tools_insert_report on app.tools for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and app.current_user_role() = 'kierownik'
    and registration = 'zgloszone'
    and state = 'w_obiegu'
    and exists (
      select 1 from app.locations l
      where l.id = location_id and l.kind = 'budowa' and l.status = 'aktywna' and l.manager_id = auth.uid()
    )
  );

-- …i zapisuje jego przyjęcie na tę budowę.
create policy movements_insert_report on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and kind = 'przyjecie'
    and from_location_id is null
    and app.current_user_role() = 'kierownik'
    and exists (
      select 1 from app.locations l
      where l.id = to_location_id and l.kind = 'budowa' and l.status = 'aktywna' and l.manager_id = auth.uid()
    )
  );

-- Przyjęcie to pierwsze pojawienie się narzędzia w ewidencji: obejmuje tylko narzędzie
-- dopisane w tej samej transakcji, w miejscu przyjęcia.
create function app.check_intake_tool() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.movements m where m.id = new.movement_id and m.kind = 'przyjecie')
     and not exists (
       select 1 from app.tools t join app.movements m on m.id = new.movement_id
       where t.id = new.tool_id and t.location_id = m.to_location_id and t.xmin = pg_current_xact_id()::xid
     ) then
    raise exception 'Przyjęcie % obejmuje tylko narzędzie dopisane w tej samej transakcji, w miejscu przyjęcia', new.movement_id;
  end if;
  return new;
end
$$;
revoke execute on function app.check_intake_tool() from public;

create trigger movement_tools_intake before insert on app.movement_tools
  for each row execute function app.check_intake_tool();

-- Status ewidencji zmienia tylko właściciel, i tylko ze zgłoszonego na zaakceptowane.
grant update (registration) on app.tools to authenticated;

create function app.check_registration_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.registration is distinct from old.registration
     and (app.current_user_role() is distinct from 'wlasciciel' or old.registration <> 'zgloszone') then
    raise exception 'Zgłoszenie narzędzia % akceptuje tylko właściciel', old.id;
  end if;
  return new;
end
$$;
revoke execute on function app.check_registration_change() from public;

create trigger tools_registration_change before update of registration on app.tools
  for each row execute function app.check_registration_change();
