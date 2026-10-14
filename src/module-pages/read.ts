import { readFile } from "node:fs/promises";
import path from "node:path";
import { type MarkdownBlock, parseMarkdown } from "@/markdown/parse";
import { MODULE_PAGES, type ModulePageId } from "./pages";

/** Folder z treścią stron modułów; `next.config.ts` dołącza go do wdrożenia. */
export const MODULE_MESSAGES_DIR = "messages/funkcje";

export interface ModulePage {
  /** Tytuł w wynikach wyszukiwania i w karcie przeglądarki (bez nazwy programu, którą dokłada layout). */
  title: string;
  /** Opis w wynikach wyszukiwania i w podglądzie linku. */
  description: string;
  /** Nagłówek `h1` na stronie. */
  heading: string;
  /** Akapit pod nagłówkiem. */
  lead: string;
  blocks: MarkdownBlock[];
}

export function parseModulePage(source: string): ModulePage {
  const { meta, blocks } = parseMarkdown(source, "Strona modułu", ["title", "description", "heading", "lead"]);
  return { title: meta.title, description: meta.description, heading: meta.heading, lead: meta.lead, blocks };
}

/** Strona modułu po polsku z `messages/funkcje/<adres>.pl.md`. */
export async function readModulePage(id: ModulePageId): Promise<ModulePage> {
  const source = await readFile(path.join(process.cwd(), MODULE_MESSAGES_DIR, `${MODULE_PAGES[id]}.pl.md`), "utf8");
  return parseModulePage(source);
}
