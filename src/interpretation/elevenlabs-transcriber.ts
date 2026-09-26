import "server-only";
import { recordingFileName, type Transcriber, TranscriptionFailedError } from "./transcription";

/** Domyślny model ElevenLabs Scribe. Zmienia go `ELEVENLABS_MODEL`. */
export const DEFAULT_ELEVENLABS_MODEL = "scribe_v2";

/** Port transkrypcji na ElevenLabs Scribe (speech-to-text), język polski, bez znaczników dźwięków tła. */
export function createElevenLabsTranscriber({ apiKey, model }: { apiKey: string; model: string }): Transcriber {
  return {
    async transcribe(audio) {
      const body = new FormData();
      body.set("model_id", model);
      body.set("language_code", "pl");
      body.set("tag_audio_events", "false");
      body.set("file", audio, recordingFileName(audio));
      let response: Response;
      try {
        response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        throw new TranscriptionFailedError("provider", "ElevenLabs API", { cause: error });
      }
      if (!response.ok) {
        throw new TranscriptionFailedError("provider", `ElevenLabs API: ${response.status} ${await response.text().catch(() => "")}`);
      }
      const { text } = (await response.json()) as { text?: string };
      return text ?? "";
    },
  };
}
