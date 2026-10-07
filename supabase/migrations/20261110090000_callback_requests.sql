-- Prośby o telefon z formularza „Zostaw numer, oddzwonimy” (strona o programie i strona /demo). Zostawia je ktoś
-- bez konta, więc zapisuje je tylko aktor systemowy, a czyta tylko super-admin. Po roku prośba znika (polityka
-- prywatności, pkt 3).
create table app.callback_requests (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null,
  -- Numer w zapisie międzynarodowym, np. +48576763536.
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Imię albo firma, jeśli ktoś je podał.
  name text check (length(btrim(name)) between 1 and 100),
  -- Strona, z której przyszła prośba.
  source text not null check (source in ('o-programie', 'demo'))
);
create index callback_requests_at_idx on app.callback_requests (at desc);
create index callback_requests_phone_idx on app.callback_requests (phone, at desc);

alter table app.callback_requests enable row level security;
grant select on app.callback_requests to authenticated;
create policy callback_requests_select on app.callback_requests for select to authenticated using (app.is_super_admin());
