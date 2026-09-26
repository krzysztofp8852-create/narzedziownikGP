-- Rodzaje ruchów dla cofnięcia, korekty, zaginięcia i wycofania. Osobna migracja,
-- bo nowej wartości typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_kind add value 'cofniecie';
alter type app.movement_kind add value 'korekta';
alter type app.movement_kind add value 'zaginiecie';
alter type app.movement_kind add value 'wycofanie';
