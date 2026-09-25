import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Zdjęcie narzędzia (do 3 MB, zwykle znacznie mniej, bo przeglądarka je zmniejsza) plus pola formularza.
      // Musi zostać poniżej limitu żądania funkcji na Vercel (4,5 MB).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
