-- Tekst, z którego powstała propozycja ruchu: ma go każdy ruch ze źródła „głos” i tylko on.
-- Właściciel widzi w historii, co kierownik napisał albo powiedział.

alter table app.movements
  add column transcript text check (length(btrim(transcript)) between 1 and 2000),
  add constraint movements_transcript_only_voice check ((source = 'glos') = (transcript is not null));
