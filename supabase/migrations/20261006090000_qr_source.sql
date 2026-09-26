-- Źródło ruchu zarejestrowanego skanerem naklejek QR w aplikacji. Osobna migracja, bo nowej
-- wartości typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_source add value 'qr';
