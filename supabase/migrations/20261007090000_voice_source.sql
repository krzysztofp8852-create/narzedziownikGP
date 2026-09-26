-- Źródło ruchu zatwierdzonego z propozycji po wpisie tekstem (i później głosem). Osobna migracja, bo nowej
-- wartości typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_source add value 'glos';
