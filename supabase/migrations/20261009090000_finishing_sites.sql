-- Zamykanie budowy.
--
-- Kierownik zamyka swoją budowę, właściciel każdą, i tylko gdy nie zostało na niej
-- żadne narzędzie w obiegu. Wymuszone zamknięcie (tylko właściciel) to najpierw
-- zaginięcie pozostałych narzędzi, a potem zwykłe zamknięcie w tej samej transakcji.
-- Zakończona budowa zostaje zakończona: nikt jej nie otworzy ani nie zmieni, a żadne
-- narzędzie w obiegu już na nią nie trafi.

alter table app.locations
  add column finished_at timestamptz,
  add column finished_by uuid,
  add foreign key (company_id, finished_by) references app.users (company_id, user_id);

-- Budowy zakończone wcześniej wprost w bazie: kto i kiedy, nie wiadomo, więc przypisujemy
-- je kierownikowi budowy z chwilą tej migracji.
update app.locations set finished_at = now(), finished_by = manager_id where status = 'zakonczona';

alter table app.locations
  add constraint locations_finished_fields check (
    (finished_at is null) = (finished_by is null)
    and (finished_at is not null) = (status is not distinct from 'zakonczona')
  );

grant update (status, finished_at, finished_by) on app.locations to authenticated;

-- Kierownika aktywnej budowy zmienia właściciel. Zamyka ją właściciel albo jej kierownik,
-- podpisując zamknięcie sobą.
drop policy locations_update_by_owner on app.locations;
create policy locations_update on app.locations for update to authenticated
  using (
    company_id = app.current_company_id()
    and kind = 'budowa'
    and status = 'aktywna'
    and (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and manager_id = auth.uid()))
  )
  with check (
    company_id = app.current_company_id()
    and case status
      when 'aktywna' then app.current_user_role() = 'wlasciciel' and app.is_site_manager_candidate(manager_id)
      when 'zakonczona' then finished_by = auth.uid()
      else false
    end
  );

-- Zamknięcie niczego poza statusem nie zmienia, a narzędzia w obiegu go blokują. Wiersz
-- budowy jest już zablokowany, więc równoległy ruch na tę budowę (który blokuje ją do
-- odczytu, patrz niżej) albo zdążył się zatwierdzić i jego narzędzia tu widać, albo
-- zobaczy budowę zakończoną.
create function app.check_site_finish() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.manager_id is distinct from old.manager_id then
    raise exception 'Przy zamknięciu budowy % nie zmienia się kierownika', old.id;
  end if;
  if exists (select 1 from app.tools t where t.location_id = new.id and t.state = 'w_obiegu') then
    raise exception 'Na budowie % zostały narzędzia w obiegu', old.id using errcode = 'GP409';
  end if;
  return new;
end
$$;
revoke execute on function app.check_site_finish() from public;

create trigger locations_finish before update of status on app.locations
  for each row when (old.status = 'aktywna' and new.status = 'zakonczona')
  execute function app.check_site_finish();

-- Narzędzie w obiegu jest tylko na aktywnej budowie: wydanie, przeniesienie, cofnięcie,
-- korekta, zgłoszenie i import. Blokada budowy do odczytu czeka na równoległe zamknięcie.
create function app.check_tool_on_active_site() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  site_status app.site_status;
begin
  select l.status into site_status from app.locations l where l.id = new.location_id and l.kind = 'budowa' for share;
  if site_status = 'zakonczona' then
    raise exception 'Narzędzie % w obiegu nie może być na zakończonej budowie', new.id using errcode = 'GP409';
  end if;
  return null;
end
$$;
revoke execute on function app.check_tool_on_active_site() from public;

create trigger tools_on_active_site after insert or update of location_id, state on app.tools
  for each row when (new.state = 'w_obiegu')
  execute function app.check_tool_on_active_site();
