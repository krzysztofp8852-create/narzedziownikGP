-- Przeniesienie między budowami, wysłanie do serwisu i przyjęcie z serwisu.
--
-- Przeniesienie rejestruje ten, kto zabiera: kierownik tylko na swoją aktywną
-- budowę, magazynier i właściciel między dowolnymi budowami. Do serwisu kierownik
-- wysyła ze swojej budowy, magazynier i właściciel z każdej budowy i z bazy.
-- Z serwisu na bazę przyjmuje magazynier albo właściciel. Każdy z tych ruchów
-- można cofnąć jak wydanie i zwrot. Narzędzia przesuwa ten sam wyzwalacz co dotąd.

drop policy movements_insert on app.movements;
create policy movements_insert on app.movements for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and author_id = auth.uid()
    and case
      when kind = 'przyjecie' then
        from_location_id is null
        and app.current_user_role() in ('wlasciciel', 'magazynier')
      when kind = 'wydanie' then
        exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'baza')
        and exists (
          select 1 from app.locations l
          where l.id = to_location_id and l.kind = 'budowa' and l.status = 'aktywna'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
      when kind = 'zwrot' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id and l.kind = 'budowa'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      when kind = 'przeniesienie' then
        from_location_id <> to_location_id
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'budowa')
        and exists (
          select 1 from app.locations l
          where l.id = to_location_id and l.kind = 'budowa' and l.status = 'aktywna'
            and (app.current_user_role() in ('wlasciciel', 'magazynier') or l.manager_id = auth.uid())
        )
      when kind = 'do_serwisu' then
        exists (
          select 1 from app.locations l
          where l.id = from_location_id
            and (
              (app.current_user_role() in ('wlasciciel', 'magazynier') and l.kind in ('baza', 'budowa'))
              or (l.kind = 'budowa' and l.manager_id = auth.uid())
            )
        )
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'serwis')
      when kind = 'z_serwisu' then
        app.current_user_role() in ('wlasciciel', 'magazynier')
        and exists (select 1 from app.locations l where l.id = from_location_id and l.kind = 'serwis')
        and exists (select 1 from app.locations l where l.id = to_location_id and l.kind = 'baza')
      -- Cofnąć można tylko własny ruch, dokładnie w odwrotną stronę i nie na zakończoną budowę.
      -- Okna 15 minut pilnuje Rejestr: czas zapisu podaje jego zegar.
      when kind = 'cofniecie' then
        not exists (
          select 1 from app.locations l where l.id = movements.to_location_id and l.kind = 'budowa' and l.status <> 'aktywna'
        )
        and exists (
          select 1 from app.movements o
          where o.id = movements.reverses_movement_id
            and o.author_id = auth.uid()
            and o.kind in ('wydanie', 'zwrot', 'przeniesienie', 'do_serwisu', 'z_serwisu')
            and o.from_location_id = movements.to_location_id
            and o.to_location_id = movements.from_location_id
        )
      when kind in ('korekta', 'zaginiecie', 'wycofanie') then app.current_user_role() = 'wlasciciel'
      else false
    end
  );
