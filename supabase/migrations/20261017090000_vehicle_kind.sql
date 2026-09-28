-- Pojazd jako rodzaj lokalizacji. Osobna migracja, bo nowej wartości typu
-- wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.location_kind add value 'pojazd';
