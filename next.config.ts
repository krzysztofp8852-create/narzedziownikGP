import type { NextConfig } from "next";
import { LEGAL_PATHS } from "./src/legal/documents";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  experimental: {
    // Nagranie głosowe idzie do akcji serwera w całości (do 4 MiB, zob. MAX_RECORDING_BYTES) z zapasem na multipart;
    // więcej i tak nie przejdzie, bo Vercel przyjmuje żądania do 4,5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Czcionki naklejek czytamy z dysku w czasie działania, więc śledzenie plików ich nie znajdzie samo. Dokumenty prawne
  // renderują się na żądanie (nonce polityki treści, ADR 0041), więc ich plik też musi być we wdrożeniu.
  outputFileTracingIncludes: {
    "/naklejki/pdf": ["./src/stickers/fonts/*.ttf"],
    ...Object.fromEntries(LEGAL_PATHS.map((path) => [path, ["./messages/prawne/*.md"]])),
  },
  // Test e2e Google Analytics otwiera lokalny serwer pod nazwą produkcji (e2e/security-headers.spec.ts), bo tylko tam
  // wczytuje się GA; `next dev` bez tego blokuje stronie pod obcą nazwą odświeżanie modułów.
  allowedDevOrigins: ["narzedziownikgp.pl"],
  async headers() {
    return [
      // Nagłówki bezpieczeństwa każdej odpowiedzi (ADR 0041); politykę treści z nonce dokłada src/proxy.ts.
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Nowa wersja service workera ma dotrzeć do telefonów przy najbliższym otwarciu aplikacji (ADR 0010).
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
