import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { t } from "@/i18n/t";
import { serverEnv } from "@/lib/env";
import { GOOGLE_PLAY_PACKAGE, GOOGLE_PLAY_URL } from "@/lib/google-play";

/**
 * Manifest aplikacji: po dodaniu do ekranu głównego (Android, iPhone) otwiera się jak zwykła aplikacja. Gdy aplikacja
 * jest w Google Play (`GOOGLE_PLAY=1`), Chrome na Androidzie proponuje ją ze sklepu zamiast instalacji strony.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Przełącznik czytany przy żądaniu, nie przy budowaniu.
  await connection();
  return {
    id: "/",
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.description"),
    lang: "pl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    ...(serverEnv.googlePlay() && {
      related_applications: [{ platform: "play", id: GOOGLE_PLAY_PACKAGE, url: GOOGLE_PLAY_URL }],
      prefer_related_applications: true,
    }),
  };
}
