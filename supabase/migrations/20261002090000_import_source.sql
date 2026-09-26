-- Źródło ruchu dla przyjęcia z importu pliku. Osobna migracja, bo nowej wartości
-- typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_source add value 'import';
