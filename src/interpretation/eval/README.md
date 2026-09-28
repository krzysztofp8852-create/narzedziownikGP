# Zestaw ewaluacyjny interpretacji

Sprawdza, jak prawdziwy port interpretacji (OpenAI, zob. `docs/adr/0005`) rozumie budowlaną polszczyznę:
slang („szlifa”, „kujak”, „niwela”), liczebniki, niejednoznaczności, przeniesienia, sprzęt w serwisie
i ruchy do serwisu i z serwisu, „wszystko z …”, narzędzia spoza ewidencji oraz pytania „gdzie jest …” (ADR 0018). Uruchamiaj go przy każdej zmianie modelu albo promptu
(`src/interpretation/openai-interpreter.ts`, podpowiedź transkrypcji w `openai-transcriber.ts`). Nie jest częścią CI:
woła płatne API, a wynik modelu może się różnić między uruchomieniami.

```bash
npm run eval:interpretation
npm run eval:interpretation -- --only slang --only kody-02      # wybrane obszary (tagi) albo przypadki
npm run eval:interpretation -- --model gpt-5.4                  # inny model niż OPENAI_MODEL
npm run eval:interpretation -- --json src/interpretation/eval/wyniki/gpt-5.4-mini.json
```

Potrzebny jest `OPENAI_API_KEY` w `.env.local`. `--concurrency N` zmienia liczbę przypadków sprawdzanych naraz
(domyślnie 4). Pliki z `--json` w katalogu `wyniki/` nie trafiają do repozytorium; przydają się do porównania
dwóch modeli.

## Jak to działa

- `companies.ts`: przykładowe ewidencje firm (osoby, baza, budowy, serwisy, narzędzia z miejscem, w którym są).
- `cases.ts`: przypadki, czyli tekst, ewidencja firmy, kto mówi i oczekiwana Propozycja ruchu.
- `eval.ts`: runner, a `report.ts` raport do konsoli. Każdy przypadek przechodzi przez moduł Interpretacja (`reply`), tak jak wpis
  w „Powiedz lub wpisz”, tylko Rejestr zastępuje ewidencja przypadku w pamięci. Moduł niczego nie zapisuje.

Raport pokazuje ✓/✗ dla każdego przypadku i przy pudle, które pole się nie zgadza: ruch czy pytanie, rodzaj, budowa, skąd,
serwis, narzędzia (kody), pytania „które?” (liczba sztuk i kody kandydatów) i nierozpoznane frazy (nieznane albo ilu
brakuje). Fraz z tekstu nie porównujemy, bo zależą od modelu. Na końcu jest trafność całości, każdego pola
i każdego obszaru.

Przypadek sprawdza całą ścieżkę: model dopasowuje frazy do kodów, a moduł wybiera egzemplarze dostępne tam,
skąd ruch zabiera sprzęt. Dlatego oczekiwana Propozycja to to, co kierownik powinien zobaczyć, a nie surowa
odpowiedź modelu.

`npm test` sprawdza sam zestaw bez AI (`cases.test.ts`): co najmniej 40 przypadków, wszystkie wymagane obszary
i spójność każdego przypadku z jego ewidencją. Przypadek z nieznanym kodem, budową albo osobą nie trafia do modelu.

## Nowy przypadek tekstowy

Dopisz obiekt do `CASES` w `cases.ts`:

```ts
{
  id: "slang-17",
  tags: ["slang"],
  company: zawbud,
  actor: "Ewa Lis", // bez tego pola mówi pierwszy kierownik z ewidencji
  text: "biorę flexa na Winogrady",
  expected: { kind: "wydanie", site: "Winogrady", tools: [], ambiguities: [{ quantity: 1, candidates: ["S-01", "S-02"] }] },
}
```

Pytanie „gdzie jest …” ma `expected: { question: true, tools: [...] }` z kodami wszystkich narzędzi w obiegu, o które pyta,
bez względu na to, gdzie są. Każdy inny przypadek sprawdza też, że model nie wziął ruchu za pytanie.

`site` i `from` to nazwy lokalizacji z ewidencji (`from` jest opcjonalne), `tools` to kody. Brak `ambiguities`
i `unrecognized` oznacza, że nie powinno być pytań ani nierozpoznanych fraz. Jeśli przypadek wymaga sprzętu
w innym miejscu, dopisz narzędzie albo nową firmę w `companies.ts`, ale pamiętaj, że Zawbud jest wspólny dla
wielu przypadków.

## Przypadki z nagraniami z budowy

Nagranie przechodzi tą samą ścieżką co w aplikacji (`proposeFromRecording`: limit rozmiaru, typ pliku, cisza)
przez prawdziwy port transkrypcji (`TRANSCRIPTION_PROVIDER`, domyślnie OpenAI gpt-4o-transcribe, zob.
`docs/adr/0006`), a rozpoznany tekst dalej przez interpretację. Kubełka nagrań runner nie używa.

1. Nagraj zdanie telefonem, najlepiej na budowie, z typowym hałasem w tle. Aplikacja nagrywa webm (Android)
   albo mp4 (iPhone); przyjmowane są też m4a, ogg, mp3 i wav. Najwyżej minuta, do 4 MiB.
2. Połóż plik w `src/interpretation/eval/nagrania/`, np. `nagrania/rataje-szlifierki.m4a`.
3. Dopisz przypadek z polem `recording` (ścieżka względem tego katalogu) i tagiem `nagrania`. W `text` wpisz,
   co naprawdę zostało powiedziane: raport pokaże to obok rozpoznanego tekstu, więc od razu widać, czy
   zawiodła transkrypcja, czy interpretacja.

   ```ts
   {
     id: "nagrania-01",
     tags: ["nagrania", "slang"],
     company: zawbud,
     text: "biorę małą szlifę i niwelę na Rataje",
     recording: "nagrania/rataje-szlifierki.m4a",
     expected: { kind: "wydanie", site: "Rataje", tools: ["S-01", "N-01"] },
   }
   ```

4. Uruchom tylko nagrania: `npm run eval:interpretation -- --only nagrania`.

Nagrania trafiają do repozytorium. To świadomy wyjątek od zasady z ADR 0006, że firma nie przechowuje
głosów pracowników: tamta zasada dotyczy nagrań z aplikacji, a tu są nagrania testowe, nagrane w tym celu. Dodawaj
więc tylko głos osób, które zgodziły się na przechowywanie nagrania, i bez danych osobowych w treści (nazwiska,
adresy). Gdy ktoś wycofa zgodę, usuń plik i jego przypadek. Nazwy budów i narzędzi muszą pasować do ewidencji przypadku, a nie
do prawdziwej firmy.
