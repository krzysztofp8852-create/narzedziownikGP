-- Kierownik widzi koszty swoich budów i pojazdów, gdy właściciel to włączy w ustawieniach firmy (domyślnie nie).
--
-- Koszt liczy się ze stawek i historii wartości, więc kierownik ze zgodą czyta stawki firmy i kategorii oraz kwoty
-- i wartości tylko tych narzędzi, które kiedyś trafiły do lokalizacji, której jest kierownikiem. Z procentu
-- wywnioskuje wartość takiego narzędzia; to akceptujemy, bo decyzję podejmuje właściciel. Stawki dalej ustawia
-- tylko właściciel, a magazynier i pracownik nie widzą ich nigdy.

alter table app.companies add column site_managers_see_costs boolean not null default false;
grant update (site_managers_see_costs) on app.companies to authenticated;

-- Czy aktor widzi koszty: właściciel zawsze, kierownik za zgodą właściciela.
create function app.sees_costs() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.users u join app.companies c on c.id = u.company_id
    where u.user_id = auth.uid() and u.active
      and (u.role = 'wlasciciel' or (u.role = 'kierownik' and c.site_managers_see_costs))
  )
$$;
revoke execute on function app.sees_costs() from public;
grant execute on function app.sees_costs() to authenticated;

-- Czy aktor widzi stawkę i wartość narzędzia: właściciel każdego, kierownik ze zgodą tego, które kiedyś trafiło
-- do lokalizacji, której jest kierownikiem.
create function app.sees_costs_of_tool(p_tool_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.current_user_role() = 'wlasciciel'
    or (
      app.sees_costs()
      and exists (
        select 1 from app.movement_tools mt
        join app.movements m on m.id = mt.movement_id
        join app.locations l on l.id = m.to_location_id
        where mt.tool_id = p_tool_id and l.company_id = app.current_company_id() and l.manager_id = auth.uid()
      )
    )
$$;
revoke execute on function app.sees_costs_of_tool(uuid) from public;
grant execute on function app.sees_costs_of_tool(uuid) to authenticated;

drop policy daily_rates_owner_select on app.daily_rates;
create policy daily_rates_select on app.daily_rates for select to authenticated
  using (
    company_id = app.current_company_id()
    and (app.current_user_role() = 'wlasciciel' or (app.sees_costs() and (kind <> 'narzedzie' or app.sees_costs_of_tool(tool_id))))
  );

drop policy tool_value_history_owner_select on app.tool_value_history;
create policy tool_value_history_select on app.tool_value_history for select to authenticated
  using (company_id = app.current_company_id() and app.sees_costs_of_tool(tool_id));
