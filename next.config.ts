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
};

export default nextConfig;
