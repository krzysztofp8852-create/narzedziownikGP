-- Raporty: tygodniowy (poniedziałek 7:00) i piątkowy (piątek 16:00) czasu polskiego.
--
-- Raport trafia do dzwonka adresata jako wpis z treścią z chwili raportu, a push i e-mail są jego kopią,
-- tak jak przy innych powiadomieniach. Zadanie harmonogramu zapisuje każdy raport firmy raz na dzień,
-- a raport tygodniowy zapamiętuje kwotę poza bazą, z którą porówna ją raport za tydzień.

alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('narzedzia_zabrane', 'prog_przekroczony', 'progi_przekroczone', 'ruch_odrzucony',
                  'raport_tygodniowy', 'raport_piatkowy'));

create table app.company_reports (
  company_id uuid not null references app.companies (id) on delete restrict,
  kind text not null check (kind in ('tygodniowy', 'piatkowy')),
  -- Dzień raportu w Polsce (poniedziałek albo piątek).
  day date not null,
  -- Łączna wartość sprzętu poza bazą w chwili raportu tygodniowego, w zł; piątkowy jej nie liczy.
  off_base_value numeric(14, 2) check ((kind = 'tygodniowy') = (off_base_value is not null)),
  generated_at timestamptz not null,
  primary key (company_id, kind, day)
);

alter table app.company_reports enable row level security;

grant select on app.company_reports to authenticated;

-- Kwoty widzi tylko właściciel. Zapisują wyłącznie zadania systemowe (poza RLS).
create policy company_reports_select on app.company_reports for select to authenticated
  using (company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel');
