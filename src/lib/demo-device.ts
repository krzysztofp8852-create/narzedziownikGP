import type { DemoDevice } from "@/registry/registry";

/** Urządzenie oglądającego demo z nagłówka User-Agent: tylko rodzaj, bez modelu i przeglądarki. */
export function demoDevice(userAgent: string | null): DemoDevice {
  const agent = userAgent ?? "";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(agent)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(agent)) return "telefon";
  return "komputer";
}
