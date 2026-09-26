/**
 * Zestaw ewaluacyjny interpretacji na prawdziwych portach: OpenAI (interpretacja) i dostawca transkrypcji
 * z konfiguracji (przypadki z nagraniami). Uruchamiaj przy zmianie modelu lub promptu; nie jest częścią CI.
 *
 *   npm run eval:interpretation
 *   npm run eval:interpretation -- --only slang --only kody-02 --model gpt-5.4 --json wyniki.json
 *
 * Klucze z .env.local (zob. README i src/interpretation/eval/README.md).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES } from "@/interpretation/eval/cases";
import { runEval } from "@/interpretation/eval/eval";
import { casesCount, formatReport } from "@/interpretation/eval/report";
import { createOpenAIInterpreter, DEFAULT_OPENAI_MODEL } from "@/interpretation/openai-interpreter";
import { RECORDING_TYPES } from "@/interpretation/transcription";
import { serverEnv } from "@/lib/env";
import { configuredTranscriber } from "@/lib/interpretation-instance";

const EVAL_DIR = resolve(import.meta.dirname, "../src/interpretation/eval");

const { values } = parseArgs({
  options: {
    only: { type: "string", multiple: true },
    model: { type: "string" },
    concurrency: { type: "string", default: "4" },
    json: { type: "string" },
  },
});

const config = serverEnv.interpreter();
if (config === null || config === "slowa") {
  console.error("Zestaw ewaluacyjny sprawdza prawdziwy model: ustaw OPENAI_API_KEY w .env.local.");
  process.exit(1);
}
const model = values.model ?? config.model ?? DEFAULT_OPENAI_MODEL;

// --only: nazwy przypadków albo obszary (tagi), np. --only slang --only kody-02.
const only = values.only ?? [];
const cases = only.length === 0 ? CASES : CASES.filter((evalCase) => only.includes(evalCase.id) || evalCase.tags.some((tag) => only.includes(tag)));
if (cases.length === 0) {
  console.error(`Żaden przypadek nie pasuje do: ${only.join(", ")}`);
  process.exit(1);
}

const recordings = cases.filter((evalCase) => evalCase.recording).length;
const transcription = serverEnv.transcription()?.provider ?? "brak";
console.log(
  `Zestaw ewaluacyjny interpretacji: model ${model}, ${casesCount(cases.length)}` +
    (recordings > 0 ? `, w tym ${recordings} z nagraniem (transkrypcja: ${transcription})` : ""),
);
console.log("");

const extensions = new Map<string, string>(Object.entries(RECORDING_TYPES).map(([type, extension]) => [`.${extension}`, type]));
const results = await runEval(
  cases,
  {
    interpreter: createOpenAIInterpreter({ apiKey: config.openaiApiKey, model }),
    transcriber: configuredTranscriber(),
    loadRecording: async (path) => {
      const type = extensions.get(extname(path).toLowerCase());
      if (!type) throw new Error(`Nieobsługiwany format nagrania ${path} (${[...extensions.keys()].join(", ")})`);
      return new Blob([await readFile(resolve(EVAL_DIR, path))], { type });
    },
  },
  { concurrency: Number(values.concurrency) || 1 },
);

console.log(formatReport(results));
if (values.json) {
  await mkdir(dirname(values.json), { recursive: true });
  await writeFile(values.json, JSON.stringify({ model, transcription, date: new Date().toISOString(), results }, null, 2));
  console.log(`\nWyniki zapisane w ${values.json}`);
}
