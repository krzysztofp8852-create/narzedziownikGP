-- Rodzaje ruchów dla przeniesienia między budowami i serwisu. Osobna migracja,
-- bo nowej wartości typu wyliczeniowego nie można użyć w transakcji, która ją dodała.

alter type app.movement_kind add value 'przeniesienie';
alter type app.movement_kind add value 'do_serwisu';
alter type app.movement_kind add value 'z_serwisu';
