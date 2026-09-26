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
  /** Wysyłka e-maili z powiadomieniami przez Resend; bez klucza powiadomienia trafiają tylko do logu. */
  resend: () =>
    process.env.RESEND_API_KEY
      ? { apiKey: process.env.RESEND_API_KEY, from: required("NOTIFICATIONS_FROM", process.env.NOTIFICATIONS_FROM) }
      : null,
};
