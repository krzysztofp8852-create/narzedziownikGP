-- Rodzaje i źródła ruchów dla wydania i zwrotu przez checklistę. Osobna migracja,
-- bo nowej wartości typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_kind add value 'wydanie';
alter type app.movement_kind add value 'zwrot';
alter type app.movement_source add value 'checklista';
