/**
 * Start serwera: t() poznaje język żądania z modułu serwerowego, zanim cokolwiek się wyrenderuje (ADR 0047). Bez tego
 * akcja albo trasa API na świeżo uruchomionej instancji mówiłaby po polsku, dopóki nic innego nie zaimportuje modułu.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./i18n/server-locale");
}
