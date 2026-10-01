-- Sprzęt wynajęty: stan „zwrócone” i ruch „zwrot do wypożyczalni”. Osobna migracja, bo nowej wartości typu
-- wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.tool_state add value 'zwrocone';
alter type app.movement_kind add value 'zwrot_do_wypozyczalni';
