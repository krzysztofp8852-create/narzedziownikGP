import type { Transcriber } from "./transcription";

/**
 * Port transkrypcji bez AI: każde nagranie „mówi” ten sam tekst. Do pracy lokalnej i testu dymnego,
 * gdy nie ma klucza dostawcy transkrypcji.
 */
export function createFixedTranscriber(text: string): Transcriber {
  return { transcribe: async () => text };
}
