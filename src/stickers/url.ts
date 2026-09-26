import { UUID_PATTERN } from "@/registry/validation";

/**
 * Adres w kodzie QR: karta narzędzia po jego losowym identyfikatorze, a nie po kodzie, więc z jednej
 * naklejki nie da się odgadnąć adresów innych narzędzi. Kartę pokaże tylko zalogowany z tej firmy.
 */
export function stickerUrl(appUrl: string, toolId: string) {
  return new URL(`/narzedzia/${encodeURIComponent(toolId)}`, appUrl).toString();
}

/**
 * Identyfikator narzędzia z kodu QR naklejki, czyli z adresu z `stickerUrl`. Inny kod QR to null.
 * Adres może pochodzić z dowolnej domeny aplikacji: identyfikator i tak szukamy tylko wśród
 * narzędzi firmy zalogowanego.
 */
export function readSticker(text: string): { toolId: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const match = /^\/narzedzia\/([^/]+)$/.exec(url.pathname);
  const toolId = match && decodeURIComponent(match[1]).toLowerCase();
  return toolId && UUID_PATTERN.test(toolId) ? { toolId } : null;
}
