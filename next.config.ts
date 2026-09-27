import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Nagranie głosowe idzie do akcji serwera w całości (do 4 MiB, zob. MAX_RECORDING_BYTES) z zapasem na multipart;
    // więcej i tak nie przejdzie, bo Vercel przyjmuje żądania do 4,5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Czcionki naklejek czytamy z dysku w czasie działania, więc śledzenie plików ich nie znajdzie samo.
  outputFileTracingIncludes: {
    "/naklejki/pdf": ["./src/stickers/fonts/*.ttf"],
  },
  // Nowa wersja service workera ma dotrzeć do telefonów przy najbliższym otwarciu aplikacji (ADR 0010).
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};

export default nextConfig;
