import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/env";

/**
 * Wyszukiwarki mogą czytać wszystko: bez sesji widzą tylko stronę o programie, demo i logowanie, a poza stroną
 * o programie każda strona ma „noindex” (src/app/layout.tsx).
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = serverEnv.siteUrl();
  return { rules: { userAgent: "*", allow: "/" }, sitemap: siteUrl ? new URL("/sitemap.xml", siteUrl).href : undefined };
}
