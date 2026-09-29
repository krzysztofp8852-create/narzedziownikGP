-- Terminy przy narzędziu: przegląd, kalibracja, badanie UDT i koniec gwarancji.
--
-- Termin ma rodzaj (jeden każdego rodzaju na narzędzie), datę i opcjonalny cykl w miesiącach. Wykonanie przeglądu
-- zapisuje dzień wykonania, a następny termin liczy się z cyklu; bez cyklu terminu po wykonaniu nie ma, dopóki
-- właściciel nie wpisze nowego. Gwarancji się nie wykonuje, tylko się kończy. Dodaje, zmienia i usuwa terminy
-- właściciel, wykonanie wpisuje też magazynier (odbiera sprzęt z serwisu), a widzi je każdy w firmie.
--
-- Do terminu można dołączyć dokumenty (zdjęcie albo PDF świadectwa, protokołu, karty gwarancyjnej, faktury).
-- Pliki leżą w prywatnym kubełku Storage, jak zdjęcia zgłoszeń. Faktura ma cenę, a ceny widzi tylko właściciel,
-- więc fakturę widzi i dodaje tylko on.
--
-- Przypomnienia w dzwonku wysyła zadanie dzienne: tydzień przed terminem i raz po jego przekroczeniu. Każde
-- zdarzenie (termin z danego dnia i faza) zapisuje się raz w app.deadline_alerts.

create table app.tool_deadlines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  tool_id uuid not null,
  kind text not null check (kind in ('przeglad', 'kalibracja', 'udt', 'gwarancja')),
  -- Następny termin; brak po wykonaniu terminu bez cyklu.
  due_on date,
  cycle_months integer check (cycle_months between 1 and 120),
  note text check (note is null or (length(btrim(note)) > 0 and length(note) <= 200)),
  last_done_on date,
  last_done_by uuid,
  -- Operacja klienta, którą wpisano ostatnie wykonanie: jej ponowne wysłanie niczego już nie zmienia.
  last_done_operation_id uuid,
  created_at timestamptz not null,
  unique (company_id, id),
  constraint tool_deadlines_kind_per_tool unique (tool_id, kind),
  constraint tool_deadlines_scheduled check (due_on is not null or last_done_on is not null),
  constraint tool_deadlines_warranty check (kind <> 'gwarancja' or (due_on is not null and cycle_months is null and last_done_on is null)),
  constraint tool_deadlines_done check ((last_done_on is null) = (last_done_by is null) and (last_done_on is null) = (last_done_operation_id is null)),
  foreign key (company_id, tool_id) references app.tools (company_id, id),
  foreign key (company_id, last_done_by) references app.users (company_id, user_id)
);
create index tool_deadlines_company_due_idx on app.tool_deadlines (company_id, due_on) where due_on is not null;

create table app.tool_deadline_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  deadline_id uuid not null,
  kind text not null check (kind in ('swiadectwo', 'protokol', 'karta_gwarancyjna', 'faktura', 'inne')),
  -- Klucz pliku w kubełku `dokumenty-narzedzi`.
  file_path text not null,
  file_name text not null check (length(btrim(file_name)) > 0 and length(file_name) <= 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null,
  client_operation_id uuid not null,
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint tool_deadline_documents_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, deadline_id) references app.tool_deadlines (company_id, id) on delete cascade,
  foreign key (company_id, uploaded_by) references app.users (company_id, user_id)
);
create index tool_deadline_documents_deadline_idx on app.tool_deadline_documents (deadline_id, sequence_number);

alter table app.tool_deadlines enable row level security;
alter table app.tool_deadline_documents enable row level security;

grant select, insert, delete on app.tool_deadlines to authenticated;
grant update (due_on, cycle_months, note) on app.tool_deadlines to authenticated;
grant select, insert, delete on app.tool_deadline_documents to authenticated;

create policy tool_deadlines_select on app.tool_deadlines for select to authenticated
  using (company_id = app.current_company_id());
create policy tool_deadlines_insert on app.tool_deadlines for insert to authenticated
  with check (
    company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel'
    and last_done_on is null and last_done_by is null and last_done_operation_id is null
  );
create policy tool_deadlines_update on app.tool_deadlines for update to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel')
  with check (company_id = app.current_company_id());
create policy tool_deadlines_delete on app.tool_deadlines for delete to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

create policy tool_deadline_documents_select on app.tool_deadline_documents for select to authenticated
  using (company_id = app.current_company_id() and (kind <> 'faktura' or app.current_user_role() = 'wlasciciel'));
create policy tool_deadline_documents_insert on app.tool_deadline_documents for insert to authenticated
  with check (
    company_id = app.current_company_id() and uploaded_by = auth.uid()
    and (app.current_user_role() = 'wlasciciel' or (app.current_user_role() = 'magazynier' and kind <> 'faktura'))
  );
create policy tool_deadline_documents_delete on app.tool_deadline_documents for delete to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

-- Wykonanie terminu (przeglądu, kalibracji, badania UDT) wpisuje właściciel albo magazynier: dzień wykonania,
-- kto wpisał i następny termin: podany (np. z protokołu po powrocie z serwisu, późniejszy niż wykonanie), a bez niego
-- z cyklu, a bez cyklu żadnego. Magazynier nie zmienia terminów wprost, więc zapis idzie przez funkcję, która zmienia
-- tylko te pola. Miesiące dodaje Postgres: 31 stycznia i miesiąc to koniec lutego.
create function app.complete_tool_deadline(p_deadline_id uuid, p_done_on date, p_next_due date, p_operation_id uuid)
returns table (due_on date)
language plpgsql security definer set search_path = ''
as $$
begin
  if app.current_user_role() is null or app.current_user_role() not in ('wlasciciel', 'magazynier') then
    raise exception 'Wykonanie terminu wpisuje tylko właściciel albo magazynier';
  end if;
  if p_next_due is not null and p_next_due <= p_done_on then
    raise exception 'Następny termin musi być po dniu wykonania';
  end if;
  return query
    update app.tool_deadlines d
    set last_done_on = p_done_on,
        last_done_by = auth.uid(),
        last_done_operation_id = p_operation_id,
        due_on = coalesce(
          p_next_due,
          case when d.cycle_months is null then null else (p_done_on + make_interval(months => d.cycle_months))::date end
        )
    where d.id = p_deadline_id and d.company_id = app.current_company_id() and d.kind <> 'gwarancja'
    returning d.due_on;
end
$$;
revoke execute on function app.complete_tool_deadline(uuid, date, date, uuid) from public;
grant execute on function app.complete_tool_deadline(uuid, date, date, uuid) to authenticated;

-- Przypomnienia o terminach wykryte przez zadanie dzienne: termin z danego dnia przypomina się najwyżej raz przed
-- (tydzień wcześniej) i raz po przekroczeniu. Tylko dla zadań systemowych: `authenticated` nie ma do tabeli uprawnień.
create table app.deadline_alerts (
  deadline_id uuid not null,
  company_id uuid not null,
  due_on date not null,
  phase text not null check (phase in ('przed', 'po')),
  detected_at timestamptz not null,
  primary key (deadline_id, due_on, phase),
  foreign key (company_id, deadline_id) references app.tool_deadlines (company_id, id) on delete cascade
);
alter table app.deadline_alerts enable row level security;

alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy', 'tylko_do_odczytu_wkrotce', 'tylko_do_odczytu', 'terminy'));

-- Prywatny kubełek na dokumenty terminów (zdjęcia i PDF). Bez polityk RLS na storage.objects czyta je i zapisuje
-- tylko serwer (klucz service_role), a pokazuje je tylko temu, kto widzi dokument. Baza testów Rejestru (PGlite)
-- nie ma schematu storage, więc tam kubełka nie zakładamy.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('dokumenty-narzedzi', 'dokumenty-narzedzi', false, 4 * 1024 * 1024,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
  end if;
end
$$;
