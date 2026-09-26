// Porty nagrania głosowego: transkrypcja (dostawca AI) i kubełek, w którym nagranie leży tylko na czas transkrypcji.

/** Prywatny kubełek Supabase Storage na nagrania (migracja `recordings_bucket`); dostęp ma tylko serwer z kluczem service_role. */
export const RECORDINGS_BUCKET = "nagrania";

/** Największe nagranie, jakie przyjmujemy: minuta mowy z telefonu z zapasem. */
export const MAX_RECORDING_BYTES = 4 * 1024 * 1024;

/**
 * Formaty nagrań i rozszerzenia plików, po których dostawca transkrypcji je rozpozna. MediaRecorder na
 * Androidzie (Chrome) nagrywa webm lub ogg, na iPhonie (Safari) mp4.
 */
export const RECORDING_TYPES = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
} as const;

export type RecordingType = keyof typeof RECORDING_TYPES;

/** Typ nagrania bez parametrów („audio/webm;codecs=opus” → „audio/webm”); null, gdy to nie nagranie, które przyjmujemy. */
export function recordingType(audio: Blob): RecordingType | null {
  const type = audio.type.split(";")[0].trim().toLowerCase();
  return Object.hasOwn(RECORDING_TYPES, type) ? (type as RecordingType) : null;
}

/** Nazwa pliku z rozszerzeniem pasującym do typu nagrania, np. „nagranie.webm”. */
export function recordingFileName(audio: Blob) {
  const type = recordingType(audio);
  return `nagranie.${type ? RECORDING_TYPES[type] : "webm"}`;
}

/**
 * Transkrypcja się nie udała: `provider`, gdy dostawca nie odpowiedział (można spróbować ponownie),
 * `silence`, gdy w nagraniu nie było słychać mowy.
 */
export class TranscriptionFailedError extends Error {
  constructor(
    readonly reason: "provider" | "silence",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TranscriptionFailedError";
  }
}

/** Port transkrypcji (gpt-4o-transcribe albo ElevenLabs Scribe): nagranie po polsku → tekst. */
export interface Transcriber {
  transcribe(audio: Blob): Promise<string>;
}

/** Kubełek nagrań (prywatny kubełek Supabase Storage). Nagranie jest w nim tylko na czas transkrypcji. */
export interface RecordingStore {
  save(key: string, audio: Blob): Promise<void>;
  remove(key: string): Promise<void>;
}
