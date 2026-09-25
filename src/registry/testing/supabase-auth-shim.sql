-- Minimalna imitacja tego, co Supabase dostarcza w każdej bazie, żeby migracje
-- i RLS działały na PGlite tak samo jak na prawdziwym Supabase:
-- role `anon`/`authenticated`/`service_role`, tabela auth.users i auth.uid().
-- Tylko do testów. Na Supabase (lokalnym i w chmurze) tego nie uruchamiamy.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text unique
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
