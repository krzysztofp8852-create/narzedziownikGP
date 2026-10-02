-- Kartoteka Ludzie: osoby firmy z kontem w programie i bez niego (ADR 0030).
--
-- Osoba ma imię i nazwisko, notatkę, stan aktywna albo nieaktywna i najwyżej jedno konto (konto ma najwyżej jedną
-- osobę). Konto należy do tej samej firmy co osoba (klucz obcy po parze konto–firma). Osoba bez konta nie loguje się,
-- więc nie zajmuje miejsca w pakiecie wdrożenia: limit liczy dalej tylko konta (ADR 0024).
--
-- Raz podpiętego konta nie da się odpiąć ani przepiąć, żeby to, co zapisano przy osobie (uprawnienia, odbicia), nie
-- przeszło na kogoś innego. Osoba z kontem jest aktywna razem z nim. Imię i nazwisko osoby z kontem jest też nazwą
-- konta (historia ruchów, nagłówek).

alter table app.users add constraint users_user_company unique (user_id, company_id);

create table app.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  note text check (note is null or length(btrim(note)) > 0),
  active boolean not null default true,
  user_id uuid unique,
  created_at timestamptz not null,
  foreign key (user_id, company_id) references app.users (user_id, company_id) on delete restrict
);
create index people_company_id_idx on app.people (company_id);

-- Każde istniejące konto (także dezaktywowane) staje się osobą z tym kontem.
insert into app.people (company_id, full_name, active, user_id, created_at)
select company_id, full_name, active, user_id, created_at from app.users;

create function app.check_person_account_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'Konta osoby nie da się odpiąć ani przepiąć';
  end if;
  -- Dezaktywacja konta dezaktywuje osobę (najpierw konto, potem osoba), a osoby z kontem nie dezaktywuje się osobno.
  if new.user_id is not null and new.active <> (select u.active from app.users u where u.user_id = new.user_id) then
    raise exception 'Osoba z kontem jest aktywna razem z kontem';
  end if;
  return new;
end;
$$;

create trigger people_account_change before update of user_id, active on app.people
  for each row execute function app.check_person_account_change();

-- Imię i nazwisko osoby przechodzi na konto: przy zmianie i przy podpięciu konta (osobę mogła zmienić równoległa
-- transakcja, zanim konto powstało). SECURITY DEFINER, bo nazwy konta nikt nie zmienia wprost; osobę zmienia tylko
-- właściciel jej firmy (polityki niżej).
create function app.sync_account_name() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null then
    update app.users set full_name = new.full_name where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke execute on function app.sync_account_name() from public;

create trigger people_sync_account_name after update of full_name, user_id on app.people
  for each row when (new.full_name is distinct from old.full_name or new.user_id is distinct from old.user_id)
  execute function app.sync_account_name();

alter table app.people enable row level security;

grant select, insert on app.people to authenticated;
grant update (full_name, note, active, user_id) on app.people to authenticated;

-- Kartotekę prowadzi i widzi właściciel; każdy widzi osobę swojego konta.
create policy people_select on app.people for select to authenticated
  using (company_id = app.current_company_id() and (app.current_user_role() = 'wlasciciel' or user_id = auth.uid()));

-- Osobę dopisuje właściciel swojej firmy, a osobę właściciela przy zakładaniu firmy także super-admin.
create policy people_insert on app.people for insert to authenticated
  with check (
    (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel')
    or app.is_super_admin()
  );

create policy people_update_by_owner on app.people for update to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel')
  with check (company_id = app.current_company_id());
