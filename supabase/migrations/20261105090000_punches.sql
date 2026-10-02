-- Odbijanie na budowie: plakat budowy z kodem QR, promień odbicia i odbicia z wynikiem sprawdzenia położenia (ADR 0032).
--
-- Budowa i baza mają losowy kod plakatu: kod QR to adres strony odbicia z tym kodem, a sam kod (10 znaków, bez
-- liter mylonych z cyframi) jest też wydrukowany do wpisania ręcznie. Nie zdradza identyfikatora budowy. „Nowy kod”
-- (funkcja niżej) unieważnia stary. Pojazd i serwis plakatu nie mają. Promień odbicia (domyślnie 300 m) zmienia
-- właściciel.
--
-- Odbicie to pobyt osoby na budowie albo bazie: wejście, a potem wyjście (skan na tej samej budowie) albo przejście
-- (skan na innej budowie zamyka ten pobyt i otwiera nowy). Przy każdym skanie Rejestr liczy odległość telefonu od
-- położenia budowy i zapisuje tylko wynik i odległość w metrach: współrzędnych telefonu nie ma w żadnej tabeli.
-- Osoba ma najwyżej jedno otwarte odbicie. Każdy z kontem odbija siebie; odbicia z wynikiem innym niż „na budowie”
-- wyjaśnia właściciel albo kierownik budowy (własnych nie, te zostają dla właściciela).

create function app.new_poster_token() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  -- Alfabet Crockforda: bez I, L, O i U, więc kod da się przepisać z plakatu.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  token text := '';
  -- Bajty bez stałych bitów wersji i wariantu UUID: każdy znak to 5 losowych bitów.
  positions constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  byte_index int;
begin
  foreach byte_index in array positions loop
    token := token || substr(alphabet, get_byte(bytes, byte_index) % 32 + 1, 1);
  end loop;
  return token;
end
$$;
revoke execute on function app.new_poster_token() from public;

alter table app.locations
  add column poster_token text unique,
  add column punch_radius_m integer;

update app.locations set poster_token = app.new_poster_token(), punch_radius_m = 300 where kind in ('budowa', 'baza');

alter table app.locations add constraint locations_punch_fields check (
  case when kind in ('budowa', 'baza') then poster_token is not null and punch_radius_m between 50 and 5000
  else poster_token is null and punch_radius_m is null end
);

-- Kod plakatu nadaje baza: kto zakłada budowę, nie wybiera go sam. SECURITY DEFINER, bo losowania kodu nikt nie
-- wywołuje wprost.
create function app.set_poster_token() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind in ('budowa', 'baza') then
    new.poster_token := app.new_poster_token();
    new.punch_radius_m := coalesce(new.punch_radius_m, 300);
  end if;
  return new;
end
$$;
revoke execute on function app.set_poster_token() from public;
create trigger locations_poster_token before insert on app.locations
  for each row execute function app.set_poster_token();

-- Promień zmienia właściciel (polityka locations_update); kodu plakatu nikt nie zmienia wprost.
grant update (punch_radius_m) on app.locations to authenticated;

-- „Nowy kod”: właściciel na aktywnej budowie i bazie, kierownik na swojej aktywnej budowie. Kierownik nie zmienia
-- wierszy budowy wprost (polityka locations_update), więc kod zmienia ta funkcja. Zwraca nowy kod; null, gdy aktor
-- nie może go zmienić.
create function app.renew_poster_token(p_location_id uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  token text;
begin
  update app.locations l set poster_token = app.new_poster_token()
  where l.id = p_location_id and l.company_id = app.current_company_id()
    and (
      (l.kind = 'baza' and app.current_user_role() = 'wlasciciel')
      or (l.kind = 'budowa' and l.status = 'aktywna'
          and (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and l.manager_id = auth.uid())))
    )
  returning l.poster_token into token;
  return token;
end
$$;
revoke execute on function app.renew_poster_token(uuid) from public;
grant execute on function app.renew_poster_token(uuid) to authenticated;

create table app.punches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  person_id uuid not null,
  location_id uuid not null,
  -- Kto zeskanował plakat (dziś zawsze sama osoba).
  punched_by uuid not null,
  entered_at timestamptz not null,
  entry_result text not null,
  entry_distance_m integer,
  entry_operation_id uuid not null,
  left_at timestamptz,
  -- `wyjscie`: skan na tej budowie, `przejscie`: skan na innej (jej położenie sprawdza wejście tamtego odbicia).
  exit_via text check (exit_via in ('wyjscie', 'przejscie')),
  exit_result text,
  exit_distance_m integer,
  exit_operation_id uuid,
  explained_at timestamptz,
  explained_by uuid,
  explanation text check (explanation is null or (length(btrim(explanation)) > 0 and length(explanation) <= 500)),
  -- Kolejność zapisu odbić z tą samą chwilą.
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint punches_entry_operation_per_company unique (company_id, entry_operation_id),
  constraint punches_exit_operation_per_company unique (company_id, exit_operation_id),
  constraint punches_results check (
    entry_result in ('na_budowie', 'poza_budowa', 'brak_polozenia', 'bez_sprawdzenia')
    and (exit_result is null or exit_result in ('na_budowie', 'poza_budowa', 'brak_polozenia', 'bez_sprawdzenia'))
  ),
  -- Odległość jest tylko tam, gdzie ją policzono; poza budową zawsze (w demo „na budowie” bez sprawdzenia jej nie ma).
  constraint punches_distances check (
    (entry_distance_m is null or (entry_distance_m >= 0 and entry_result in ('na_budowie', 'poza_budowa')))
    and (entry_result <> 'poza_budowa' or entry_distance_m is not null)
    and (exit_distance_m is null or (exit_distance_m >= 0 and exit_result in ('na_budowie', 'poza_budowa')))
    and (exit_result is distinct from 'poza_budowa' or exit_distance_m is not null)
  ),
  constraint punches_exit check (
    (left_at is null) = (exit_via is null)
    and (left_at is null or left_at >= entered_at)
    and ((exit_via = 'wyjscie') = (exit_result is not null))
    and (left_at is not null or exit_operation_id is null)
  ),
  constraint punches_explained check (
    (explained_at is null) = (explained_by is null) and (explained_at is not null or explanation is null)
  ),
  foreign key (company_id, person_id) references app.people (company_id, id),
  foreign key (company_id, location_id) references app.locations (company_id, id),
  foreign key (company_id, punched_by) references app.users (company_id, user_id),
  foreign key (company_id, explained_by) references app.users (company_id, user_id)
);
-- Osoba jest odbita najwyżej w jednym miejscu naraz.
create unique index punches_one_open_per_person on app.punches (person_id) where left_at is null;
create index punches_location_idx on app.punches (location_id, entered_at desc);
create index punches_person_idx on app.punches (person_id, entered_at desc);

-- Wejścia nie zmienia nikt. Wyjście zapisuje raz (po otwartym odbiciu) sama osoba; wyjaśnia właściciel albo
-- kierownik budowy, który nie jest tą osobą, i tylko odbicie z wynikiem innym niż „na budowie”. Aktor systemowy
-- (bez JWT) może wszystko poza wejściem.
create function app.check_punch_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  own boolean := exists (select 1 from app.people p where p.id = old.person_id and p.user_id = auth.uid());
  manages boolean := exists (select 1 from app.locations l where l.id = old.location_id and l.manager_id = auth.uid());
begin
  if (new.company_id, new.person_id, new.location_id, new.punched_by, new.entered_at, new.entry_result,
      new.entry_distance_m, new.entry_operation_id)
     is distinct from (old.company_id, old.person_id, old.location_id, old.punched_by, old.entered_at,
      old.entry_result, old.entry_distance_m, old.entry_operation_id) then
    raise exception 'Wejścia odbicia % się nie zmienia', old.id;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if (new.left_at, new.exit_via, new.exit_result, new.exit_distance_m, new.exit_operation_id)
     is distinct from (old.left_at, old.exit_via, old.exit_result, old.exit_distance_m, old.exit_operation_id)
     and (old.left_at is not null or not own) then
    raise exception 'Wyjście odbicia % zapisuje raz sama osoba', old.id;
  end if;
  if (new.explained_at, new.explained_by, new.explanation) is distinct from (old.explained_at, old.explained_by, old.explanation)
     and (old.explained_at is not null or new.explained_by is distinct from auth.uid()
          or not (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'kierownik' and manages and not own))
          or (new.entry_result = 'na_budowie' and coalesce(new.exit_result, 'na_budowie') = 'na_budowie')) then
    raise exception 'Odbicia % aktor nie wyjaśnia', old.id;
  end if;
  return new;
end
$$;
create trigger punches_update before update on app.punches
  for each row execute function app.check_punch_update();

alter table app.punches enable row level security;

grant select, insert on app.punches to authenticated;
grant update (left_at, exit_via, exit_result, exit_distance_m, exit_operation_id, explained_at, explained_by, explanation)
  on app.punches to authenticated;

-- Widzą: właściciel wszystkie, kierownik odbicia na budowach, których jest kierownikiem, a każdy własne.
create policy punches_select on app.punches for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  );
-- Każdy odbija tylko siebie, na budowie albo bazie swojej firmy.
create policy punches_insert on app.punches for insert to authenticated
  with check (
    company_id = app.current_company_id() and punched_by = auth.uid()
    and exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid() and p.active)
    and exists (select 1 from app.locations l where l.id = location_id and (l.kind = 'baza' or (l.kind = 'budowa' and l.status = 'aktywna')))
    and left_at is null and explained_at is null
  );
create policy punches_update on app.punches for update to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
      or (app.current_user_role() = 'kierownik' and exists (select 1 from app.locations l where l.id = location_id and l.manager_id = auth.uid()))
    )
  )
  with check (company_id = app.current_company_id());
