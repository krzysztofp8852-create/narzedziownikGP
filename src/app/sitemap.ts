import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/env";
import { MODULE_PAGE_PATHS } from "@/module-pages/pages";

/** Strony dla wyszukiwarek: strona o programie pod adresem głównym i strony modułów (ADR 0046). */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = serverEnv.siteUrl();
  return siteUrl ? ["/", ...MODULE_PAGE_PATHS].map((path) => ({ url: new URL(path, siteUrl).href })) : [];
}
