import { type MarkdownBlock, parseMarkdown } from "@/markdown/parse";

export type { Inline } from "@/markdown/parse";
export type LegalBlock = MarkdownBlock;

export interface LegalDocument {
  title: string;
  /** Data wersji tak, jak ją pokazujemy („29 września 2026”). */
  version: string;
  /** Projekt przed przeglądem prawnika; strona to wyraźnie pokazuje. */
  draft: boolean;
  blocks: LegalBlock[];
}

/**
 * Dokument prawny z pliku tekstowego w małym podzbiorze Markdownu (`parseMarkdown`), który prawnik może poprawiać
 * wprost; nagłówek pliku ma `title`, `version` i `draft: tak|nie`.
 */
export function parseLegalDocument(source: string): LegalDocument {
  const { meta, blocks } = parseMarkdown(source, "Dokument prawny", ["title", "version"]);
  // Literówka nie może po cichu schować ostrzeżenia o projekcie.
  if (meta.draft !== "tak" && meta.draft !== "nie") throw new Error("Dokument prawny: pole draft musi mieć wartość tak albo nie");
  return { title: meta.title, version: meta.version, draft: meta.draft === "tak", blocks };
}
