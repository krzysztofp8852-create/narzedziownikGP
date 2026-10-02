-- Flota: dane pojazdu i terminy pojazdu.
--
-- Pojazd dostaje opcjonalne pola: numer rejestracyjny i VIN. Zmienia je właściciel, jak resztę aktywnego pojazdu.
--
-- Termin pojazdu to ten sam wiersz `app.tool_deadlines` co termin narzędzia, tylko jego przedmiotem jest pojazd
-- (`vehicle_id`) zamiast narzędzia: przegląd techniczny, OC, AC, legalizacja tachografu albo własny z nazwą. Ma cykl,
-- wykonanie, dokumenty i przypomnienia jak termin narzędzia. Każdego rodzaju jest najwyżej jeden na pojazd, a własnych
-- wiele, z różnymi nazwami. Terminy pojazdu dodaje, zmienia, wykonuje i usuwa tylko właściciel; widzi je każdy w firmie.
--
-- Dokumenty terminów pojazdu (polisa, dowód rejestracyjny, protokół) widzą tylko właściciel i kierownik pojazdu:
-- polisa ma dane właściciela pojazdu, a pokazuje się ją przy kontroli drogowej. Fakturę dalej widzi tylko właściciel.

alter table app.locations
  add column registration_number text,
  add column vin text,
  add constraint locations_vehicle_data check (
    (kind = 'pojazd' or (registration_number is null and vin is null))
    and (registration_number is null or registration_number ~ '^[A-Z0-9]+( [A-Z0-9]+)*$' and length(registration_number) <= 12)
    and (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$')
  );
grant insert (registration_number, vin) on app.locations to authenticated;
grant update (registration_number, vin) on app.locations to authenticated;

alter table app.tool_deadlines
  alter column tool_id drop not null,
  add column vehicle_id uuid,
  -- Nazwa własnego terminu pojazdu, np. „Wymiana opon”; inne rodzaje jej nie mają.
  add column name text,
  drop constraint tool_deadlines_kind_check,
  add constraint tool_deadlines_kind_check check (
    case
      when tool_id is not null then vehicle_id is null and kind in ('przeglad', 'kalibracja', 'udt', 'gwarancja', 'zwrot')
      else vehicle_id is not null and kind in ('przeglad_techniczny', 'oc', 'ac', 'tachograf', 'wlasny')
    end
  ),
  add constraint tool_deadlines_name check (
    (kind = 'wlasny') = (name is not null) and (name is null or (length(btrim(name)) > 0 and length(name) <= 100))
  ),
  add foreign key (company_id, vehicle_id) references app.locations (company_id, id);

create unique index tool_deadlines_kind_per_vehicle on app.tool_deadlines (vehicle_id, kind) where vehicle_id is not null and kind <> 'wlasny';
create unique index tool_deadlines_name_per_vehicle on app.tool_deadlines (vehicle_id, lower(name)) where kind = 'wlasny';

grant update (name) on app.tool_deadlines to authenticated;

-- Termin pojazdu dostaje tylko aktywny pojazd firmy.
drop policy tool_deadlines_insert on app.tool_deadlines;
create policy tool_deadlines_insert on app.tool_deadlines for insert to authenticated
  with check (
    company_id = app.current_company_id() and app.current_user_role() = 'wlasciciel'
    and last_done_on is null and last_done_by is null and last_done_operation_id is null
    and (vehicle_id is null or exists (select 1 from app.locations l where l.id = vehicle_id and l.kind = 'pojazd' and l.active))
  );

alter table app.tool_deadline_documents drop constraint tool_deadline_documents_kind_check;
alter table app.tool_deadline_documents add constraint tool_deadline_documents_kind_check
  check (kind in ('swiadectwo', 'protokol', 'karta_gwarancyjna', 'faktura', 'polisa', 'dowod_rejestracyjny', 'inne'));

-- Czy aktor widzi dokumenty terminu (poza fakturą, którą widzi tylko właściciel): termin narzędzia każdy w firmie,
-- a termin pojazdu właściciel i kierownik pojazdu.
create function app.sees_deadline_documents(p_deadline_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.tool_deadlines d left join app.locations l on l.id = d.vehicle_id
    where d.id = p_deadline_id and d.company_id = app.current_company_id()
      and (d.tool_id is not null or app.current_user_role() = 'wlasciciel' or l.manager_id = auth.uid())
  )
$$;
revoke execute on function app.sees_deadline_documents(uuid) from public;
grant execute on function app.sees_deadline_documents(uuid) to authenticated;

drop policy tool_deadline_documents_select on app.tool_deadline_documents;
create policy tool_deadline_documents_select on app.tool_deadline_documents for select to authenticated
  using (
    company_id = app.current_company_id() and (kind <> 'faktura' or app.current_user_role() = 'wlasciciel')
    and app.sees_deadline_documents(deadline_id)
  );

-- Magazynier dołącza dokumenty tylko do terminów narzędzi (odbiera sprzęt z serwisu).
drop policy tool_deadline_documents_insert on app.tool_deadline_documents;
create policy tool_deadline_documents_insert on app.tool_deadline_documents for insert to authenticated
  with check (
    company_id = app.current_company_id() and uploaded_by = auth.uid()
    and (
      app.current_user_role() = 'wlasciciel'
      or (
        app.current_user_role() = 'magazynier' and kind <> 'faktura'
        and exists (select 1 from app.tool_deadlines d where d.id = deadline_id and d.tool_id is not null)
      )
    )
  );

-- Wykonanie: magazynier tylko terminu narzędzia. Bez podanej daty następny termin to dzień wykonania plus cykl, a przy
-- OC i AC koniec obecnej polisy plus cykl, o ile polisa jeszcze trwała w dniu odnowienia: nowa zaczyna się po starej.
create or replace function app.complete_tool_deadline(p_deadline_id uuid, p_done_on date, p_next_due date, p_operation_id uuid)
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
          case
            when d.cycle_months is null then null
            when d.kind in ('oc', 'ac') then (greatest(d.due_on, p_done_on) + make_interval(months => d.cycle_months))::date
            else (p_done_on + make_interval(months => d.cycle_months))::date
          end
        )
    where d.id = p_deadline_id and d.company_id = app.current_company_id() and d.kind <> 'gwarancja'
      and (d.tool_id is not null or app.current_user_role() = 'wlasciciel')
    returning d.due_on;
end
$$;
