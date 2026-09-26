import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Czcionki naklejek czytamy z dysku w czasie działania, więc śledzenie plików ich nie znajdzie samo.
  outputFileTracingIncludes: {
    "/naklejki/pdf": ["./src/stickers/fonts/*.ttf"],
  },
};

export default nextConfig;
