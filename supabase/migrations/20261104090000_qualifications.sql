-- Uprawnienia ludzi: badania, szkolenia BHP i uprawnienia przy osobie z kartoteki Ludzie (ADR 0031).
--
-- Uprawnienie ma rodzaj ze stałej listy albo własny rodzaj firmy, datę „ważne do”, opcjonalny cykl w miesiącach,
-- notatkę, opis (UDT: urządzenie, prawo jazdy: kategoria, SEP: grupa) i dokumenty. Wykonanie przesuwa datę o cykl
-- od dnia wykonania, jak przy terminach narzędzi (ADR 0019); bez cyklu nową datę podaje wpisujący.
--
-- Badania lekarskie (okresowe i do pracy na wysokości) to dane o zdrowiu (art. 9 RODO): zapisujemy z nich tylko datę
-- ważności i cykl, bez notatki i opisu, a dokumenty badań (orzeczenia) dodaje i czyta tylko właściciel.
--
-- Wpisują, zmieniają i wykonują właściciel i kierownik (kierownik bez dokumentów badań), usuwa tylko właściciel.
-- Widzą: właściciel i kierownik wszystkie, a każdy własne (przez osobę swojego konta). Własne rodzaje dodaje właściciel.

-- Kierownik widzi osoby z kartoteki (imię i nazwisko przy uprawnieniach); kartotekę prowadzi dalej tylko właściciel.
drop policy people_select on app.people;
create policy people_select on app.people for select to authenticated
  using (company_id = app.current_company_id() and (app.current_user_role() in ('wlasciciel', 'kierownik') or user_id = auth.uid()));

alter table app.people add constraint people_company_id unique (company_id, id);

create table app.qualification_kinds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 100),
  created_at timestamptz not null,
  unique (company_id, id)
);
create unique index qualification_kinds_name_per_company on app.qualification_kinds (company_id, lower(name));

create table app.qualifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies (id) on delete restrict,
  person_id uuid not null,
  kind text not null check (kind in (
    'badania_lekarskie', 'szkolenie_bhp', 'badania_wysokosc', 'sep', 'udt', 'prawo_jazdy', 'pierwsza_pomoc', 'wlasny'
  )),
  custom_kind_id uuid,
  detail text check (detail is null or (length(btrim(detail)) > 0 and length(detail) <= 100)),
  due_on date not null,
  cycle_months integer check (cycle_months between 1 and 120),
  note text check (note is null or (length(btrim(note)) > 0 and length(note) <= 200)),
  last_done_on date,
  last_done_by uuid,
  -- Operacja klienta, którą wpisano ostatnie wykonanie: jej ponowne wysłanie niczego już nie zmienia.
  last_done_operation_id uuid,
  created_at timestamptz not null,
  unique (company_id, id),
  constraint qualifications_custom_kind check ((kind = 'wlasny') = (custom_kind_id is not null)),
  constraint qualifications_detail check (
    case when kind in ('udt', 'prawo_jazdy') then detail is not null when kind = 'sep' then true else detail is null end
  ),
  -- Opisu badania nie mają (reguła wyżej), a notatki też nie: przy badaniach zapisujemy tylko datę.
  constraint qualifications_medical check (kind not in ('badania_lekarskie', 'badania_wysokosc') or note is null),
  constraint qualifications_done check ((last_done_on is null) = (last_done_by is null) and (last_done_on is null) = (last_done_operation_id is null)),
  foreign key (company_id, person_id) references app.people (company_id, id),
  foreign key (company_id, custom_kind_id) references app.qualification_kinds (company_id, id),
  foreign key (company_id, last_done_by) references app.users (company_id, user_id)
);
-- Jedno uprawnienie danego rodzaju na osobę; UDT, prawo jazdy i SEP po jednym na każdy opis (urządzenie, kategorię).
create unique index qualifications_kind_per_person on app.qualifications (
  person_id, kind, coalesce(custom_kind_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(coalesce(detail, ''))
);
create index qualifications_company_due_idx on app.qualifications (company_id, due_on);

create table app.qualification_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  qualification_id uuid not null,
  -- Klucz pliku w kubełku dokumentów (`dokumenty-narzedzi`), pod prefiksem `<firma>/uprawnienia/`.
  file_path text not null,
  file_name text not null check (length(btrim(file_name)) > 0 and length(file_name) <= 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null,
  client_operation_id uuid not null,
  sequence_number bigint generated always as identity,
  unique (company_id, id),
  constraint qualification_documents_operation_per_company unique (company_id, client_operation_id),
  foreign key (company_id, qualification_id) references app.qualifications (company_id, id) on delete cascade,
  foreign key (company_id, uploaded_by) references app.users (company_id, user_id)
);
create index qualification_documents_qualification_idx on app.qualification_documents (qualification_id, sequence_number);

alter table app.qualification_kinds enable row level security;
alter table app.qualifications enable row level security;
alter table app.qualification_documents enable row level security;

grant select, insert on app.qualification_kinds to authenticated;
grant select, insert, delete on app.qualifications to authenticated;
grant update (due_on, cycle_months, note, detail, last_done_on, last_done_by, last_done_operation_id) on app.qualifications to authenticated;
grant select, insert, delete on app.qualification_documents to authenticated;

create policy qualification_kinds_select on app.qualification_kinds for select to authenticated
  using (company_id = app.current_company_id());
create policy qualification_kinds_insert on app.qualification_kinds for insert to authenticated
  with check (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

create policy qualifications_select on app.qualifications for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() in ('wlasciciel', 'kierownik')
      or exists (select 1 from app.people p where p.id = person_id and p.user_id = auth.uid())
    )
  );
create policy qualifications_insert on app.qualifications for insert to authenticated
  with check (
    company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'kierownik')
    and last_done_on is null and last_done_by is null and last_done_operation_id is null
  );
create policy qualifications_update on app.qualifications for update to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() in ('wlasciciel', 'kierownik'))
  with check (company_id = app.current_company_id());
create policy qualifications_delete on app.qualifications for delete to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

-- Dokumenty badań lekarskich (orzeczenia) widzi i dodaje tylko właściciel; pozostałe każdy, kto widzi uprawnienie.
create policy qualification_documents_select on app.qualification_documents for select to authenticated
  using (
    company_id = app.current_company_id()
    and (
      app.current_user_role() = 'wlasciciel'
      or exists (
        select 1 from app.qualifications q
        where q.id = qualification_id and q.kind not in ('badania_lekarskie', 'badania_wysokosc')
      )
    )
  );
create policy qualification_documents_insert on app.qualification_documents for insert to authenticated
  with check (
    company_id = app.current_company_id() and uploaded_by = auth.uid()
    and (
      app.current_user_role() = 'wlasciciel'
      or (
        app.current_user_role() = 'kierownik'
        and exists (
          select 1 from app.qualifications q
          where q.id = qualification_id and q.kind not in ('badania_lekarskie', 'badania_wysokosc')
        )
      )
    )
  );
create policy qualification_documents_delete on app.qualification_documents for delete to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');

-- Przypomnienia o uprawnieniach wykryte przez zadanie dzienne: uprawnienie z daną datą przypomina się najwyżej raz
-- przed (30 dni wcześniej) i raz po końcu ważności. Tylko dla zadań systemowych: `authenticated` nie ma uprawnień.
create table app.qualification_alerts (
  qualification_id uuid not null,
  company_id uuid not null,
  due_on date not null,
  phase text not null check (phase in ('przed', 'po')),
  detected_at timestamptz not null,
  primary key (qualification_id, due_on, phase),
  foreign key (company_id, qualification_id) references app.qualifications (company_id, id) on delete cascade
);
alter table app.qualification_alerts enable row level security;

alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy', 'tylko_do_odczytu_wkrotce', 'tylko_do_odczytu', 'terminy',
                  'sprzet_wynajety', 'uprawnienia'));
