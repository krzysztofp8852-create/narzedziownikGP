# 0006. Transkrypcja nagrań za portem, nagranie w Storage tylko na czas transkrypcji

Data: 2026-09-26 · Status: przyjęta (retencję u dostawcy transkrypcji sprawdzić przed pierwszym płacącym klientem)

## Kontekst

Kierownik nagrywa zdanie („biorę dwie szlifierki i młot na Rataje”) zamiast je wpisywać (#16). Specyfikacja
(#1) wskazuje gpt-4o-transcribe albo ElevenLabs Scribe za portem, Supabase Storage jako tymczasowe miejsce
nagrań („magazyn” w specyfikacji; w kodzie „kubełek nagrań”, bo „magazyn” w słowniku to baza) i wymaga, żeby nagranie znikało zaraz po rozpoznaniu, bo firma nie ma przechowywać głosów pracowników.

## Decyzja

- Telefon nagrywa MediaRecorderem (Android: webm/Opus, iPhone: mp4, 48 kb/s, najwyżej minuta) i wysyła nagranie
  w całości do akcji serwera (`serverActions.bodySizeLimit` 4,5 MB, tyle co limit żądania na Vercel; moduł
  przyjmuje do 4 MiB).
- Moduł Interpretacja (`proposeFromRecording`) kładzie nagranie do prywatnego kubełka `nagrania` pod kluczem
  `<firma>/<losowy identyfikator>`, woła port transkrypcji i w `finally` usuwa nagranie, więc znika ono także
  wtedy, gdy zapis albo transkrypcja się nie powiedzie. Usunięcie przy chwilowej awarii jest powtarzane raz;
  gdy i to zawiedzie, klucz nagrania trafia do logu serwera, a kierownik dostaje wynik transkrypcji. Kubełek nie ma polityk RLS: czyta i pisze tylko serwer z kluczem
  service_role. Rozpoznany tekst idzie dalej tą samą ścieżką co wpis tekstem (ADR 0005).
- Port transkrypcji ma dwa adaptery wybierane w `TRANSCRIPTION_PROVIDER`: OpenAI (`gpt-4o-transcribe`,
  domyślny przy `OPENAI_API_KEY`, język polski z krótką podpowiedzią stylu) i ElevenLabs Scribe (`scribe_v2`).
  Lokalnie i w teście dymnym `staly` zwraca tekst z `TRANSCRIPTION_FIXED_TEXT`.
- Bez klucza wybranego dostawcy nagrywanie jest wyłączone, a wpis tekstem działa dalej.
- Gdy nie udało się zrozumieć rozpoznanego tekstu, kierownik dostaje go w polu wpisu, żeby poprawić i wysłać
  bez mówienia od nowa. W historii ruch z nagrania wygląda jak ruch z wpisu: źródło `glos` i tekst.

## Konsekwencje

- Nagranie przez chwilę leży w Storage (region projektu Supabase) i u dostawcy transkrypcji. OpenAI API nie
  trenuje na danych organizacji; ElevenLabs trzyma nagrania według swojej polityki retencji, a tryb zerowej
  retencji (`enable_logging=false`) jest tylko w planie Enterprise. Oba trzeba ująć w polityce prywatności
  i umowie powierzenia jako podprocesorów.
- Jeśli serwer padnie między zapisem a usunięciem albo usunięcie zawiedzie dwa razy, nagranie zostaje w kubełku. Przy obecnej skali to rzadkie
  i widoczne w Storage; gdyby się zdarzało, potrzebne będzie zadanie harmonogramu czyszczące stare nagrania.
- Nagrywanie bez zasięgu (#20) idzie tą samą ścieżką: kolejka w IndexedDB wysyła nagranie, gdy sieć wróci (ADR 0009).
