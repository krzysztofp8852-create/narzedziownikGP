import "server-only";
import { headers } from "next/headers";

/** Adres tej aplikacji z nagłówków żądania: do linków w e-mailach, które mają wrócić na ten sam serwer. */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const explicit = headerList.get("origin");
  if (explicit) return explicit;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return `${headerList.get("x-forwarded-proto") ?? "https"}://${host}`;
}
