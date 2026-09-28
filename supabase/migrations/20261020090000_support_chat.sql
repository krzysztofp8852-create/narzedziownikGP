-- Czat z supportem: rozmowa użytkownika firmy z GP Engineering.
--
-- Jeden wątek na użytkownika (właściciel, kierownik, magazynier; pracownik nie ma czatu). Wątek widzi tylko
-- jego użytkownik i super-admini; nawet właściciel firmy nie czyta wątków swoich ludzi. Wiadomości tylko się
-- dopisują. Wiadomość użytkownika niesie kontekst (rola w chwili pisania, ekran, wersja aplikacji), a może mieć
-- zdjęcie lub zrzut ekranu (w prywatnym kubełku Storage, czyta je tylko serwer).
--
-- Po wiadomości użytkownika, na którą od doby nie było od nas żadnej odpowiedzi (także przy pierwszej), baza
-- sama dopisuje automatyczną odpowiedź. Kto co przeczytał, pamięta wątek: numer ostatniej przeczytanej
-- wiadomości po stronie użytkownika i po stronie supportu.

create table app.support_threads (
  -- Wątek należy do jednego użytkownika i nosi jego identyfikator.
  user_id uuid primary key,
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null,
  -- Numer (sequence_number) ostatniej wiadomości, którą przeczytał użytkownik, i ostatniej, którą przeczytał support.
  user_read_up_to bigint not null default 0,
  support_read_up_to bigint not null default 0,
  foreign key (company_id, user_id) references app.users (company_id, user_id)
);

create table app.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references app.support_threads (user_id) on delete restrict,
  -- Użytkownik, do którego należy wątek, support (super-admin) albo automatyczna odpowiedź.
  sender text not null check (sender in ('uzytkownik', 'support', 'auto')),
  author_id uuid references auth.users (id) on delete restrict,
  body text not null default '' check (length(body) <= 2000),
  -- Klucz zdjęcia w kubełku `zdjecia-czatu`.
  photo_path text,
  -- Kontekst wiadomości użytkownika: rola w chwili pisania, ekran, z którego pisał, i wersja aplikacji.
  role app.user_role,
  screen text check (length(screen) <= 300),
  app_version text check (length(app_version) <= 100),
  created_at timestamptz not null,
  client_operation_id uuid,
  sequence_number bigint generated always as identity,
  constraint support_messages_content check (length(btrim(body)) > 0 or photo_path is not null),
  constraint support_messages_operation_per_thread unique (thread_id, client_operation_id),
  -- `is true`: warunek z brakującą wartością (null) też odrzuca wiersz.
  constraint support_messages_sender check ((
    case sender
      when 'uzytkownik' then author_id = thread_id and role is not null and role <> 'pracownik' and client_operation_id is not null
      when 'support' then author_id is not null and author_id <> thread_id and client_operation_id is not null
        and role is null and screen is null and app_version is null
      else author_id is null and client_operation_id is null and photo_path is null
        and role is null and screen is null and app_version is null
    end
  ) is true)
);
create index support_messages_thread_idx on app.support_messages (thread_id, sequence_number);

-- Wątek tylko się dopisuje: bez edycji i usuwania wiadomości.
create function app.forbid_support_message_change() returns trigger
language plpgsql
as $$
begin
  raise exception 'Czat z supportem tylko się dopisuje (% na %)', tg_op, tg_table_name;
end
$$;
create trigger support_messages_append_only before update or delete on app.support_messages
  for each row execute function app.forbid_support_message_change();

-- Automatyczna odpowiedź po wiadomości użytkownika, gdy od doby nie odpowiedzieliśmy (my ani automat), więc także
-- po pierwszej wiadomości w wątku. Bez obietnicy konkretnego czasu.
create function app.auto_reply_to_support_message() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.support_messages m
    where m.thread_id = new.thread_id and m.sender in ('support', 'auto') and m.created_at > new.created_at - interval '1 day'
  ) then
    insert into app.support_messages (thread_id, sender, body, created_at)
    values (new.thread_id, 'auto', 'Dzięki za wiadomość! Odpiszemy, jak tylko znajdziemy chwilę.', new.created_at);
  end if;
  return null;
end
$$;
revoke execute on function app.auto_reply_to_support_message() from public;

create trigger support_messages_auto_reply after insert on app.support_messages
  for each row when (new.sender = 'uzytkownik')
  execute function app.auto_reply_to_support_message();

-- Znacznik „przeczytane” użytkownika zmienia tylko on, a supportu tylko super-admin.
create function app.check_support_thread_read() returns trigger
language plpgsql
as $$
begin
  if new.user_read_up_to is distinct from old.user_read_up_to and old.user_id is distinct from auth.uid() then
    raise exception 'Wątek % czyta za użytkownika tylko on sam', old.user_id;
  end if;
  if new.support_read_up_to is distinct from old.support_read_up_to and not app.is_super_admin() then
    raise exception 'Wątek % czyta za support tylko super-admin', old.user_id;
  end if;
  return new;
end
$$;
create trigger support_threads_read before update on app.support_threads
  for each row execute function app.check_support_thread_read();

alter table app.support_threads enable row level security;
alter table app.support_messages enable row level security;

grant select, insert on app.support_threads to authenticated;
grant update (user_read_up_to, support_read_up_to) on app.support_threads to authenticated;
grant select, insert on app.support_messages to authenticated;

-- Czat mają właściciel, kierownik i magazynier; pracownik swoje sprawy zgłasza właścicielowi.
create policy support_threads_select on app.support_threads for select to authenticated
  using (user_id = auth.uid() or app.is_super_admin());
create policy support_threads_insert on app.support_threads for insert to authenticated
  with check (
    user_id = auth.uid() and company_id = app.current_company_id()
    and app.current_user_role() in ('wlasciciel', 'kierownik', 'magazynier')
    and user_read_up_to = 0 and support_read_up_to = 0
  );
create policy support_threads_update on app.support_threads for update to authenticated
  using (user_id = auth.uid() or app.is_super_admin())
  with check (user_id = auth.uid() or app.is_super_admin());

create policy support_messages_select on app.support_messages for select to authenticated
  using (exists (select 1 from app.support_threads t where t.user_id = thread_id));
-- Użytkownik pisze tylko we własnym wątku, z rolą, którą ma; support odpowiada w każdym. Automatyczną dopisuje baza.
create policy support_messages_insert_by_user on app.support_messages for insert to authenticated
  with check (
    sender = 'uzytkownik' and author_id = auth.uid() and thread_id = auth.uid()
    and role = app.current_user_role() and role in ('wlasciciel', 'kierownik', 'magazynier')
  );
create policy support_messages_insert_by_support on app.support_messages for insert to authenticated
  with check (sender = 'support' and author_id = auth.uid() and app.is_super_admin());

-- Prywatny kubełek na zdjęcia z czatu, jak `zdjecia-zgloszen`: czyta je i zapisuje tylko serwer, a pokazuje
-- tylko użytkownikowi wątku i supportowi. Baza testów Rejestru (PGlite) nie ma schematu storage.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('zdjecia-czatu', 'zdjecia-czatu', false, 4 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end
$$;
