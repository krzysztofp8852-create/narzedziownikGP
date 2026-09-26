-- Naklejki QR: kiedy ostatnio wydrukowano naklejkę narzędzia. Brak daty to narzędzie
-- jeszcze nieoklejone. Adres w kodzie QR zawiera identyfikator narzędzia (tools.id,
-- losowy UUID), a nie jego kod, więc z naklejki nie da się odgadnąć innych adresów.

alter table app.tools add column sticker_printed_at timestamptz;

grant update (sticker_printed_at) on app.tools to authenticated;

-- Datę druku zapisuje tylko właściciel. Zmiana kodu unieważnia wydrukowaną naklejkę,
-- bo jest na niej stary kod: narzędzie znów jest nieoklejone.
create function app.check_sticker_printed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.sticker_printed_at is distinct from old.sticker_printed_at
     and app.current_user_role() is distinct from 'wlasciciel' then
    raise exception 'Naklejki narzędzia % drukuje tylko właściciel', old.id;
  end if;
  if new.code is distinct from old.code then
    new.sticker_printed_at := null;
  end if;
  return new;
end
$$;
revoke execute on function app.check_sticker_printed() from public;

create trigger tools_sticker_printed before update of code, sticker_printed_at on app.tools
  for each row execute function app.check_sticker_printed();
