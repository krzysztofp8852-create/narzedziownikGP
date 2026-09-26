import "server-only";
import OpenAI, { toFile } from "openai";
import { recordingFileName, recordingType, type Transcriber, TranscriptionFailedError } from "./transcription";

/** Domyślny model transkrypcji OpenAI. Zmienia go `OPENAI_TRANSCRIPTION_MODEL`. */
export const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

/** Podpowiedź stylu dla modelu: o czym i jak mówi kierownik (kody narzędzi pisane jak na naklejkach). */
const PROMPT =
  "Kierownik budowy mówi, jakie narzędzia zabiera z bazy albo oddaje, np.: Biorę dwie szlifierki i młot Hilti na Rataje. Oddaję S-03 i niwelator.";

/** Port transkrypcji na OpenAI (gpt-4o-transcribe). Nagranie idzie do dostawcy jako plik, język polski. */
export function createOpenAITranscriber({ apiKey, model }: { apiKey: string; model: string }): Transcriber {
  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
  return {
    async transcribe(audio) {
      try {
        const file = await toFile(audio, recordingFileName(audio), { type: recordingType(audio) ?? audio.type });
        const { text } = await client.audio.transcriptions.create({ file, model, language: "pl", prompt: PROMPT });
        return text;
      } catch (error) {
        throw new TranscriptionFailedError("provider", "OpenAI API (transkrypcja)", { cause: error });
      }
    },
  };
}
