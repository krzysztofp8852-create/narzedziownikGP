-- Dopisek „zgłoszony brak” na tablicy widzi każdy w firmie, jak flagę „uszkodzone”, choć samo zgłoszenie
-- widzą tylko uprawnieni (app.sees_issue). Funkcja zdradza tylko to, czy do narzędzia firmy aktora jest otwarte
-- zgłoszenie braku, bez treści i autora.
create function app.tool_reported_missing(p_tool_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.issues i
    where i.tool_id = p_tool_id and i.company_id = app.current_company_id() and i.kind = 'brak' and i.status = 'otwarte'
  )
$$;
revoke execute on function app.tool_reported_missing(uuid) from public;
grant execute on function app.tool_reported_missing(uuid) to authenticated;
