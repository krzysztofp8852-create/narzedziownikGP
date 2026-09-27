function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name} (zob. README)`);
  return value;
}

// NEXT_PUBLIC_* muszą być odczytane dosłownie, żeby Next wstawił je do kodu przeglądarki.
export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
};

export const serverEnv = {
  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  /**
   * Adres aplikacji w kodach QR na naklejkach, np. https://narzedziownik.gp-engineering.pl. Bez niego
   * adres, z którego otwarto aplikację; na produkcji ustaw go, żeby naklejki nie wskazywały podglądu.
   */
  appUrl: () => process.env.APP_URL || null,
  /**
   * Interpretacja wpisu tekstem: klucz OpenAI API (model z `OPENAI_MODEL`, domyślnie gpt-5.4-mini), a lokalnie
   * i w teście dymnym `TEXT_ENTRY_INTERPRETER=slowa` (słowa kluczowe bez AI). Bez żadnego z nich wpis tekstem
   * jest wyłączony.
   */
  interpreter: (): { openaiApiKey: string; model: string | null } | "slowa" | null =>
    process.env.OPENAI_API_KEY
      ? { openaiApiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || null }
      : process.env.TEXT_ENTRY_INTERPRETER === "slowa"
        ? "slowa"
        : null,
  /**
   * Transkrypcja nagrań głosowych: `TRANSCRIPTION_PROVIDER` wybiera dostawcę. `openai` (domyślny, gdy jest
   * `OPENAI_API_KEY`): model z `OPENAI_TRANSCRIPTION_MODEL`, domyślnie gpt-4o-transcribe. `elevenlabs`: klucz
   * `ELEVENLABS_API_KEY`, model z `ELEVENLABS_MODEL`, domyślnie scribe_v2. Lokalnie i w teście dymnym `staly`:
   * każde nagranie to tekst z `TRANSCRIPTION_FIXED_TEXT`, bez AI. Bez dostawcy (albo bez jego klucza) nagrywanie
   * jest wyłączone; błędna konfiguracja nie może położyć tablicy ani wpisu tekstem.
   */
  transcription: ():
    | { provider: "openai"; apiKey: string; model: string | null }
    | { provider: "elevenlabs"; apiKey: string; model: string | null }
    | { provider: "staly"; text: string }
    | null => {
    const { OPENAI_API_KEY, ELEVENLABS_API_KEY, TRANSCRIPTION_FIXED_TEXT } = process.env;
    switch (process.env.TRANSCRIPTION_PROVIDER || "openai") {
      case "openai":
        return OPENAI_API_KEY ? { provider: "openai", apiKey: OPENAI_API_KEY, model: process.env.OPENAI_TRANSCRIPTION_MODEL || null } : null;
      case "elevenlabs":
        return ELEVENLABS_API_KEY ? { provider: "elevenlabs", apiKey: ELEVENLABS_API_KEY, model: process.env.ELEVENLABS_MODEL || null } : null;
      case "staly":
        return TRANSCRIPTION_FIXED_TEXT ? { provider: "staly", text: TRANSCRIPTION_FIXED_TEXT } : null;
      default:
        return null;
    }
  },
  /** Sekret zadań harmonogramu (Vercel Cron wysyła go w nagłówku `Authorization`); bez niego zadania są wyłączone. */
  cronSecret: () => process.env.CRON_SECRET || null,
  /**
   * Powiadomienia push: para kluczy VAPID serwera (`npx web-push generate-vapid-keys`) i kontakt dla usług push
   * (`VAPID_SUBJECT`, np. mailto:powiadomienia@gp-engineering.pl). Bez kluczy przeglądarka nie ma czego
   * subskrybować, więc włączanie powiadomień jest ukryte, a kopie push trafiają tylko do logu.
   */
  webPush: () =>
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ? {
          publicKey: process.env.VAPID_PUBLIC_KEY,
          privateKey: process.env.VAPID_PRIVATE_KEY,
          subject: required("VAPID_SUBJECT", process.env.VAPID_SUBJECT),
        }
      : null,
  /** Wysyłka e-maili z powiadomieniami przez Resend; bez klucza powiadomienia trafiają tylko do logu. */
  resend: () =>
    process.env.RESEND_API_KEY
      ? { apiKey: process.env.RESEND_API_KEY, from: required("NOTIFICATIONS_FROM", process.env.NOTIFICATIONS_FROM) }
      : null,
};
