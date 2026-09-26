import "server-only";
import { createInterpretation, InterpretationFailedError, type Interpreter } from "@/interpretation/interpretation";
import { keywordInterpreter } from "@/interpretation/keyword-interpreter";
import { createElevenLabsTranscriber, DEFAULT_ELEVENLABS_MODEL } from "@/interpretation/elevenlabs-transcriber";
import { createFixedTranscriber } from "@/interpretation/fixed-transcriber";
import { createOpenAIInterpreter, DEFAULT_OPENAI_MODEL } from "@/interpretation/openai-interpreter";
import { createOpenAITranscriber, DEFAULT_OPENAI_TRANSCRIPTION_MODEL } from "@/interpretation/openai-transcriber";
import { createSupabaseRecordingStore } from "@/interpretation/supabase-recording-store";
import { type Transcriber, TranscriptionFailedError } from "@/interpretation/transcription";
import { publicEnv, serverEnv } from "./env";
import { getRegistry } from "./registry-instance";

let interpretation: ReturnType<typeof createInterpretation> | undefined;

/** Czy wpis tekstem jest włączony (jest klucz OpenAI API albo lokalna interpretacja słów kluczowych). */
export function textEntryEnabled() {
  return serverEnv.interpreter() !== null;
}

/** Czy nagrywanie głosu jest włączone: jest dostawca transkrypcji, a rozpoznany tekst ma kto zinterpretować. */
export function voiceEntryEnabled() {
  return textEntryEnabled() && serverEnv.transcription() !== null;
}

/** Moduł Interpretacja na Rejestrze aplikacji. Zatwierdzenie działa także bez dostawcy AI. */
export function getInterpretation() {
  interpretation ??= createInterpretation({
    registry: getRegistry(),
    interpreter: interpreter(),
    transcriber: transcriber(),
    recordings: createSupabaseRecordingStore(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey()),
  });
  return interpretation;
}

function transcriber(): Transcriber {
  const config = serverEnv.transcription();
  switch (config?.provider) {
    case "openai":
      return createOpenAITranscriber({ apiKey: config.apiKey, model: config.model ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL });
    case "elevenlabs":
      return createElevenLabsTranscriber({ apiKey: config.apiKey, model: config.model ?? DEFAULT_ELEVENLABS_MODEL });
    case "staly":
      return createFixedTranscriber(config.text);
    case undefined:
      return {
        transcribe: async () => {
          throw new TranscriptionFailedError("provider", "Nagrywanie jest wyłączone: brak dostawcy transkrypcji");
        },
      };
  }
}

function interpreter(): Interpreter {
  const config = serverEnv.interpreter();
  if (config === "slowa") return keywordInterpreter;
  if (config) return createOpenAIInterpreter({ apiKey: config.openaiApiKey, model: config.model ?? DEFAULT_OPENAI_MODEL });
  return {
    interpret: async () => {
      throw new InterpretationFailedError("Wpis tekstem jest wyłączony: brak OPENAI_API_KEY");
    },
  };
}
