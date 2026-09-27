import type { MetadataRoute } from "next";
import { t } from "@/i18n/t";

/** Manifest aplikacji: po dodaniu do ekranu głównego (Android, iPhone) otwiera się jak zwykła aplikacja. */
export default function manifest(): MetadataRoute.Manifest {
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
  };
}
