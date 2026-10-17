import { readPoster } from "@/posters/url";
import { readSticker } from "@/stickers/url";

/** Co zeskanowano (albo wpisano) w Skanuj: plakat budowy to odbicie, naklejka narzędzia to ruch albo karta narzędzia. */
export type ScannedCode = { kind: "plakat"; code: string } | { kind: "narzedzie"; toolId: string } | { kind: "nierozpoznany" };

/** Narzędzie firmy, które Skanuj rozpozna po kodzie wpisanym ręcznie. */
export interface ToolCode {
  id: string;
  code: string;
}

/** Kod bez spacji i kresek, wielkimi literami: „h 03” i „H03” to H-03. */
function bareCode(text: string) {
  return text.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Rozpoznaje kod z jednego przycisku Skanuj. Kod QR naklejki (adres karty narzędzia) to narzędzie, a kod QR plakatu
 * (adres strony odbicia) to plakat, oba z dowolnej domeny aplikacji. Tekst wpisany ręcznie to najpierw kod narzędzia
 * z `tools` (w całości, bez względu na wielkość liter, spacje i kreski), potem kod plakatu w każdym zapisie
 * (`readPoster`). Wszystko inne, także inny adres, jest nierozpoznane.
 */
export function recognizeCode(text: string, tools: readonly ToolCode[]): ScannedCode {
  const sticker = readSticker(text);
  if (sticker) return { kind: "narzedzie", toolId: sticker.toolId };
  const isAddress = /^[a-z][a-z0-9+.-]*:/i.test(text.trim());
  const wanted = bareCode(text);
  const tool = !isAddress && wanted ? tools.find((candidate) => bareCode(candidate.code) === wanted) : undefined;
  if (tool) return { kind: "narzedzie", toolId: tool.id };
  const poster = readPoster(text);
  return poster ? { kind: "plakat", code: poster.code } : { kind: "nierozpoznany" };
}
