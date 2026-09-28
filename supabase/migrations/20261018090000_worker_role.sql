-- Pracownik jako rola w firmie. Osobna migracja, bo nowej wartości typu
-- wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.user_role add value 'pracownik';
