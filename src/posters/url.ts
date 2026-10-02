import { normalizePosterCode } from "@/registry/poster-code";

/**
 * Adres w kodzie QR plakatu budowy: strona odbicia po losowym kodzie plakatu, a nie po identyfikatorze budowy. Po
 * „Nowy kod” stary adres przestaje działać. Odbicie zapisze się tylko po zalogowaniu do tej firmy.
 */
export function posterUrl(appUrl: string, code: string) {
  return new URL(`/odbicie/${encodeURIComponent(code)}`, appUrl).toString();
}

/**
 * Kod plakatu z kodu QR (adres z `posterUrl` z dowolnej domeny aplikacji) albo wpisany ręcznie z plakatu, bez względu
 * na wielkość liter, spacje, myślnik i mylone znaki (O jak 0, I i L jak 1). Inny tekst to null.
 */
export function readPoster(text: string): { code: string } | null {
  const trimmed = text.trim();
  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    const match = /^\/odbicie\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;
    candidate = decodeURIComponent(match[1]);
  }
  const code = normalizePosterCode(candidate);
  return code ? { code } : null;
}

/** Kod plakatu do przepisania: „7K3MQ-9XZ2B”. */
export function formatPosterCode(code: string) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
