-- Zgłoszenia do właściciela i flaga „uszkodzone”.
--
-- Każda osoba w firmie zgłasza właścicielowi sprawę: uszkodzenie sprzętu, brak lub zaginięcie albo inną.
-- Zgłoszenie ma opis, opcjonalne zdjęcie (w prywatnym kubełku Storage, czyta je tylko serwer), narzędzie
-- lub lokalizację, status otwarte / zamknięte i wątek komentarzy, który tylko się dopisuje. Zamknięcie to
-- komentarz zamykający. Kto poza właścicielem i autorem widzi zgłoszenia, ustawia właściciel: kierownik
-- lokalizacji, której zgłoszenie dotyczy, i magazynier (wszystkie, z osobną zgodą na zamykanie).
--
-- Zgłoszenie uszkodzenia od razu oznacza narzędzie jako uszkodzone (tools.damaged_since). Flaga nie blokuje
-- ruchów; zdejmuje ją ruch z serwisu albo właściciel, który zamyka zgłoszenie z oceną „sprawne”. Obie
-- zmiany robią wyzwalacze, więc nikt nie ustawi ani nie zdejmie flagi inną drogą.
--
-- Okno 📋 zgłoszeń to osobna od dzwonka skrzynka wpisów (nowe zgłoszenie, komentarz, zamknięcie, zgłoszenie
-- narzędzia) z własnym licznikiem nieprzeczytanych. Wpisy zapisują się w transakcji zdarzenia, dla każdego,
-- kto widzi zgłoszenie, poza jego sprawcą.

alter table app.companies
  add column issues_site_managers boolean not null default true,
  add column issues_storekeepers boolean not null default true,
  add column issues_storekeepers_close boolean not null default false;
grant update (issues_site_managers, issues_storekeepers, issues_storekeepers_close) on app.companies to authenticated;

alter table app.tools add column damaged_since timestamptz;

create table app.issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  kind text not null check (kind in ('uszkodzenie', 'brak', 'inne')),
  description text not null check (length(btrim(description)) > 0 and length(description) <= 2000),
  tool_id uuid,
  -- Czego dotyczy zgłoszenie: lokalizacja wskazana wprost albo ta, w której narzędzie było przy zgłoszeniu.
  location_id uuid,
  -- Klucz zdjęcia w kubełku `zdjecia-zgloszen`.
  photo_path text,
  author_id uuid not null,
  status text not null default 'otwarte' check (status in ('otwarte', 'zamkniete')),
  created_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid,
  -- Właściciel zamknął zgłoszenie uszkodzenia, uznając narzędzie za sprawne (zdjęło flagę).
  tool_working boolean,
  client_operation_id uuid not null,
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint issues_operation_per_company unique (company_id, client_operation_id),
  constraint issues_damage_has_tool check (kind <> 'uszkodzenie' or tool_id is not null),
  constraint issues_closed_fields check ((status = 'zamkniete') = (closed_at is not null and closed_by is not null)),
  constraint issues_tool_working check (tool_working is null or (kind = 'uszkodzenie' and status = 'zamkniete')),
  foreign key (company_id, tool_id) references app.tools (company_id, id),
  foreign key (company_id, location_id) references app.locations (company_id, id),
  foreign key (company_id, author_id) references app.users (company_id, user_id),
  foreign key (company_id, closed_by) references app.users (company_id, user_id)
);
create index issues_company_idx on app.issues (company_id, status, created_at desc);
create index issues_tool_idx on app.issues (tool_id) where tool_id is not null;

create table app.issue_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  issue_id uuid not null,
  author_id uuid not null,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  -- Komentarz, którym zgłoszenie zamknięto.
  closes boolean not null default false,
  created_at timestamptz not null,
  client_operation_id uuid not null,
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint issue_comments_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, issue_id) references app.issues (company_id, id),
  foreign key (company_id, author_id) references app.users (company_id, user_id)
);
create index issue_comments_issue_idx on app.issue_comments (issue_id, sequence_number);

-- Wątek tylko się dopisuje: bez edycji i usuwania komentarzy.
create function app.forbid_comment_change() returns trigger
language plpgsql
as $$
begin
  raise exception 'Wątek zgłoszenia tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;
create trigger issue_comments_append_only before update or delete on app.issue_comments
  for each row execute function app.forbid_comment_change();

-- Czy osoba widzi zgłoszenie o tym autorze i tej lokalizacji: autor i właściciel zawsze, magazynier
-- i kierownik lokalizacji według ustawień firmy. Tylko w firmie aktora. Funkcja dostaje pola wiersza,
-- a nie jego identyfikator, bo polityka sprawdza też wiersz, który dopiero się zapisuje.
create function app.sees_issue(p_user_id uuid, p_author_id uuid, p_location_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.users u join app.companies c on c.id = u.company_id
    where u.user_id = p_user_id and u.active and u.company_id = app.current_company_id()
      and (
        u.user_id = p_author_id
        or u.role = 'wlasciciel'
        or (u.role = 'magazynier' and c.issues_storekeepers)
        or (u.role = 'kierownik' and c.issues_site_managers
            and exists (select 1 from app.locations l where l.id = p_location_id and l.manager_id = u.user_id))
      )
  )
$$;
revoke execute on function app.sees_issue(uuid, uuid, uuid) from public;
grant execute on function app.sees_issue(uuid, uuid, uuid) to authenticated;

-- Czy aktor zamyka zgłoszenia: właściciel zawsze, magazynier, gdy widzi zgłoszenia i ma na to zgodę.
create function app.closes_issues() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.users u join app.companies c on c.id = u.company_id
    where u.user_id = auth.uid() and u.active
      and (u.role = 'wlasciciel' or (u.role = 'magazynier' and c.issues_storekeepers and c.issues_storekeepers_close))
  )
$$;
revoke execute on function app.closes_issues() from public;
grant execute on function app.closes_issues() to authenticated;

alter table app.issues enable row level security;
alter table app.issue_comments enable row level security;

grant select, insert on app.issues to authenticated;
grant update (status, closed_at, closed_by, tool_working) on app.issues to authenticated;
grant select, insert on app.issue_comments to authenticated;

create policy issues_select on app.issues for select to authenticated
  using (company_id = app.current_company_id() and app.sees_issue(auth.uid(), author_id, location_id));

-- Zgłoszenie składa każda rola w firmie, zawsze jako otwarte.
create policy issues_insert on app.issues for insert to authenticated
  with check (
    company_id = app.current_company_id() and author_id = auth.uid()
    and status = 'otwarte' and closed_at is null and closed_by is null and tool_working is null
  );

-- Zamyka ten, kto widzi zgłoszenie i zamyka zgłoszenia; zamkniętego nikt nie otwiera ponownie.
create policy issues_close on app.issues for update to authenticated
  using (company_id = app.current_company_id() and status = 'otwarte' and app.closes_issues())
  with check (company_id = app.current_company_id() and status = 'zamkniete' and closed_by = auth.uid());

-- Komentuje ten, kto widzi zgłoszenie, dopóki jest otwarte; komentarz zamykający dopisuje tylko ten, kto zamyka.
create policy issue_comments_select on app.issue_comments for select to authenticated
  using (company_id = app.current_company_id() and exists (select 1 from app.issues i where i.id = issue_id));
create policy issue_comments_insert on app.issue_comments for insert to authenticated
  with check (
    company_id = app.current_company_id() and author_id = auth.uid()
    and exists (select 1 from app.issues i where i.id = issue_id and i.status = 'otwarte')
    and (not closes or app.closes_issues())
  );

-- Zgłoszenie uszkodzenia oznacza narzędzie jako uszkodzone; drugie zgłoszenie zostawia pierwszą datę.
create function app.flag_damaged_tool() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update app.tools set damaged_since = coalesce(damaged_since, new.created_at) where id = new.tool_id;
  return null;
end
$$;
revoke execute on function app.flag_damaged_tool() from public;

create trigger issues_flag_damaged after insert on app.issues
  for each row when (new.kind = 'uszkodzenie')
  execute function app.flag_damaged_tool();

-- Zamknięcie wymaga komentarza zamykającego z tej samej transakcji, a ocenę „sprawne” (zdjęcie flagi)
-- daje tylko właściciel. Poza tym zamknięcie niczego w zgłoszeniu nie zmienia.
create function app.check_issue_close() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.issue_comments c
    where c.issue_id = new.id and c.closes and c.author_id = new.closed_by and c.xmin = pg_current_xact_id()::xid
  ) then
    raise exception 'Zgłoszenie % zamyka się komentarzem', old.id;
  end if;
  if new.tool_working and app.current_user_role() is distinct from 'wlasciciel' then
    raise exception 'Narzędzie ze zgłoszenia % uznaje za sprawne tylko właściciel', old.id;
  end if;
  if new.tool_working then
    update app.tools set damaged_since = null where id = new.tool_id;
  end if;
  return new;
end
$$;
revoke execute on function app.check_issue_close() from public;

create trigger issues_close before update of status on app.issues
  for each row when (old.status = 'otwarte' and new.status = 'zamkniete')
  execute function app.check_issue_close();

-- Ruch z serwisu zdejmuje flagę „uszkodzone”; ruch do serwisu jej nie rusza.
create function app.clear_damage_after_service() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.movements m where m.id = new.movement_id and m.kind = 'z_serwisu') then
    update app.tools set damaged_since = null where id = new.tool_id;
  end if;
  return null;
end
$$;
revoke execute on function app.clear_damage_after_service() from public;

create trigger movement_tools_clear_damage after insert on app.movement_tools
  for each row execute function app.clear_damage_after_service();

-- Okno 📋: wpisy o zgłoszeniach dla każdego, kto je widzi, i o zgłoszeniach narzędzi dla właścicieli.
create table app.issue_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  recipient_id uuid not null,
  kind text not null check (kind in ('zgloszenie', 'komentarz', 'zamkniecie', 'zgloszenie_narzedzia')),
  issue_id uuid,
  comment_id uuid,
  tool_id uuid,
  created_at timestamptz not null,
  read_at timestamptz,
  constraint issue_entries_subject check (
    case kind
      when 'zgloszenie' then issue_id is not null and comment_id is null and tool_id is null
      when 'zgloszenie_narzedzia' then tool_id is not null and issue_id is null and comment_id is null
      else issue_id is not null and comment_id is not null and tool_id is null
    end
  ),
  foreign key (company_id, recipient_id) references app.users (company_id, user_id),
  foreign key (company_id, issue_id) references app.issues (company_id, id),
  foreign key (company_id, comment_id) references app.issue_comments (company_id, id),
  foreign key (company_id, tool_id) references app.tools (company_id, id)
);
create index issue_entries_recipient_idx on app.issue_entries (recipient_id) where read_at is null;
-- To samo zdarzenie daje adresatowi najwyżej jeden wpis.
create unique index issue_entries_once_per_event on app.issue_entries (recipient_id, kind, coalesce(comment_id, issue_id, tool_id));

alter table app.issue_entries enable row level security;

grant select on app.issue_entries to authenticated;
grant update (read_at) on app.issue_entries to authenticated;

create policy issue_entries_select on app.issue_entries for select to authenticated
  using (recipient_id = auth.uid());
create policy issue_entries_update on app.issue_entries for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Wpisy zdarzenia aktora, w jego transakcji: adresatów (kto widzi zgłoszenie poza aktorem, a przy zgłoszeniu
-- narzędzia aktywni właściciele) ustala sama funkcja, i przyjmuje tylko zdarzenia, których aktor jest
-- sprawcą. Zwraca nowe wpisy, żeby kopię push dostały tylko one.
create function app.deliver_issue_entries(
  p_kind text, p_issue_id uuid, p_comment_id uuid, p_tool_id uuid, p_created_at timestamptz
) returns table (entry_id uuid, recipient uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := app.current_company_id();
  v_issue record;
begin
  if v_company_id is null then
    raise exception 'Wpis w oknie zgłoszeń zapisuje tylko aktywny użytkownik firmy';
  end if;
  if p_kind = 'zgloszenie_narzedzia' then
    if not exists (
      select 1 from app.tools t
      join app.movement_tools mt on mt.tool_id = t.id
      join app.movements m on m.id = mt.movement_id and m.kind = 'przyjecie'
      where t.id = p_tool_id and t.company_id = v_company_id and t.registration = 'zgloszone' and m.author_id = auth.uid()
    ) then
      raise exception 'Wpis o zgłoszonym narzędziu tylko od kierownika, który je zgłosił';
    end if;
    return query
      with inserted as (
        insert into app.issue_entries (company_id, recipient_id, kind, tool_id, created_at)
        select v_company_id, u.user_id, p_kind, p_tool_id, p_created_at
        from app.users u
        where u.company_id = v_company_id and u.active and u.role = 'wlasciciel' and u.user_id <> auth.uid()
        on conflict do nothing
        returning id, recipient_id
      )
      select i.id, i.recipient_id from inserted i;
    return;
  end if;

  select i.id, i.author_id, i.location_id into v_issue
  from app.issues i where i.id = p_issue_id and i.company_id = v_company_id;
  if not found then
    raise exception 'Nie ma zgłoszenia %', p_issue_id;
  end if;
  if p_kind = 'zgloszenie' then
    if v_issue.author_id <> auth.uid() or p_comment_id is not null then
      raise exception 'Wpis o nowym zgłoszeniu tylko od jego autora';
    end if;
  elsif p_kind in ('komentarz', 'zamkniecie') then
    if not exists (
      select 1 from app.issue_comments c
      where c.id = p_comment_id and c.issue_id = p_issue_id and c.author_id = auth.uid() and c.closes = (p_kind = 'zamkniecie')
    ) then
      raise exception 'Wpis o komentarzu tylko od jego autora';
    end if;
  else
    raise exception 'Nieznany rodzaj wpisu %', p_kind;
  end if;
  return query
    with inserted as (
      insert into app.issue_entries (company_id, recipient_id, kind, issue_id, comment_id, created_at)
      select v_company_id, u.user_id, p_kind, p_issue_id, p_comment_id, p_created_at
      from app.users u
      where u.company_id = v_company_id and u.active and u.user_id <> auth.uid()
        and app.sees_issue(u.user_id, v_issue.author_id, v_issue.location_id)
      on conflict do nothing
      returning id, recipient_id
    )
    select i.id, i.recipient_id from inserted i;
end
$$;
revoke execute on function app.deliver_issue_entries(text, uuid, uuid, uuid, timestamptz) from public;
grant execute on function app.deliver_issue_entries(text, uuid, uuid, uuid, timestamptz) to authenticated;

-- Prywatny kubełek na zdjęcia zgłoszeń. Bez polityk RLS na storage.objects czyta je i zapisuje tylko serwer
-- (klucz service_role), a pokazuje je tylko temu, kto widzi zgłoszenie. Baza testów Rejestru (PGlite) nie ma
-- schematu storage, więc tam kubełka nie zakładamy.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('zdjecia-zgloszen', 'zdjecia-zgloszen', false, 4 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end
$$;
