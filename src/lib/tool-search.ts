import type { FoundTool } from "@/interpretation/proposal";

/** Małe litery, bez polskich znaków i bez kresek w kodach: „s01” znajdzie S-01, „szlifierka” Szlifierkę. */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

const bare = (text: string) => text.replace(/[^a-z0-9]/g, "");

/** Pola narzędzia, po których szukamy; kategoria, marka i model tylko tam, gdzie je znamy. */
interface Searchable {
  code: string;
  name: string;
  category?: string;
  brand?: string | null;
  model?: string | null;
}

/**
 * Czy narzędzie pasuje do wyszukiwania: każde słowo zapytania jest w nazwie, kategorii, marce albo modelu, albo
 * zapytanie to kod (bez kresek i odstępów). „hilti te 30” znajdzie Młotowiertarkę Hilti TE 30-A36, a „s01” S-01.
 */
export function matchesTool(tool: Searchable, query: string) {
  const wanted = normalize(query.trim());
  if (!wanted) return true;
  if (bare(normalize(tool.code)).includes(bare(wanted))) return true;
  const text = normalize([tool.name, tool.category, tool.brand, tool.model].filter(Boolean).join(" "));
  return wanted.split(/\s+/).every((word) => text.includes(word) || bare(normalize(tool.code)) === bare(word));
}

/**
 * Narzędzie na liście wyszukiwania: gdzie jest i dane, po których się go szuka, z flagami z tablicy. Przy zaginionym
 * (`lost`) miejsce to to, gdzie było ostatnio, a dni liczą się od zaginięcia.
 */
export interface SearchTool extends Omit<FoundTool, "place"> {
  /** Rodzaju lokalizacji, w której narzędzie zaginęło, tablica nie podaje. */
  place: { name: string; kind: FoundTool["place"]["kind"] | null };
  category?: string;
  brand?: string | null;
  model?: string | null;
  lost?: boolean;
  damaged?: boolean;
  alarm?: boolean;
}
