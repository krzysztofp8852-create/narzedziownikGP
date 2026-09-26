-- Prywatny kubełek Supabase Storage na nagrania głosowe. Nagranie leży w nim tylko na czas transkrypcji
-- (moduł Interpretacja usuwa je zaraz potem, także po nieudanej transkrypcji). Bez polityk RLS na
-- storage.objects nikt poza serwerem z kluczem service_role nie czyta ani nie zapisuje nagrań.
-- Baza testów Rejestru (PGlite) nie ma schematu storage, więc tam kubełka nie zakładamy.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'nagrania',
      'nagrania',
      false,
      4 * 1024 * 1024,
      array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav']
    )
    on conflict (id) do nothing;
  end if;
end
$$;
