import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/env";

/** Jedyna strona dla wyszukiwarek: strona o programie pod adresem głównym. */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = serverEnv.siteUrl();
  return siteUrl ? [{ url: new URL("/", siteUrl).href }] : [];
}
