/** Kawałek tekstu: zwykły, wytłuszczony albo odnośnik. */
export type Inline = { text: string; href?: string; strong?: true };

export type LegalBlock =
  | { kind: "heading"; level: 2 | 3; id: string; text: string }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: { content: Inline[]; children: Inline[][] }[] };

export interface LegalDocument {
  title: string;
  /** Data wersji tak, jak ją pokazujemy („29 września 2026”). */
  version: string;
  /** Projekt przed przeglądem prawnika; strona to wyraźnie pokazuje. */
  draft: boolean;
  blocks: LegalBlock[];
}

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const HEADING = /^(#{2,3}) (.+)$/;
const ORDERED = /^(\d+)\. (.+)$/;
const BULLET = /^- (.+)$/;
const CHILD = /^\s{2,}- (.+)$/;
const CONTINUATION = /^\s{2,}(\S.*)$/;
/** Odnośnik `[tekst](adres)` albo wytłuszczenie `**tekst**`. */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Dokument prawny z pliku tekstowego w małym podzbiorze Markdownu, który prawnik może poprawiać wprost:
 * nagłówek pliku (`title`, `version`, `draft: tak|nie`), `##` i `###`, akapity, punkty `1.` z wciętymi
 * podpunktami `-`, listy `-`, odnośniki `[tekst](adres)` i wytłuszczenia `**tekst**`.
 */
export function parseLegalDocument(source: string): LegalDocument {
  // Edytor prawnika może zapisać plik ze znacznikiem BOM i końcami linii Windows.
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = FRONT_MATTER.exec(normalized);
  if (!match) throw new Error("Dokument prawny bez nagłówka (--- title, version, draft ---)");
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n").filter((line) => line.trim() !== "")) {
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`Dokument prawny: linia nagłówka bez dwukropka („${line}”)`);
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  for (const key of ["title", "version"]) if (!meta[key]) throw new Error(`Dokument prawny bez pola ${key}`);
  // Literówka nie może po cichu schować ostrzeżenia o projekcie.
  if (meta.draft !== "tak" && meta.draft !== "nie") throw new Error("Dokument prawny: pole draft musi mieć wartość tak albo nie");
  return { title: meta.title, version: meta.version, draft: meta.draft === "tak", blocks: parseBlocks(normalized.slice(match[0].length)) };
}

function parseBlocks(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] | null = null;
  let list: { ordered: boolean; start: number; items: { text: string; children: string[] }[] } | null = null;

  const flush = () => {
    if (paragraph) blocks.push({ kind: "paragraph", content: inline(paragraph.join(" ")) });
    if (list) {
      const { ordered, start, items } = list;
      blocks.push({
        kind: "list",
        ordered,
        start,
        items: items.map((item) => ({ content: inline(item.text), children: item.children.map(inline) })),
      });
    }
    paragraph = null;
    list = null;
  };

  for (const line of body.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const text = heading[2].trim();
      blocks.push({ kind: "heading", level: heading[1].length as 2 | 3, id: anchor(text), text });
      continue;
    }
    const numbered = ORDERED.exec(line);
    const bullet = numbered ? null : BULLET.exec(line);
    if (numbered || bullet) {
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
      }
      list.items.push({ text: (numbered ? numbered[2] : bullet![1]).trim(), children: [] });
      continue;
    }
    const last = list?.items.at(-1);
    const child = CHILD.exec(line);
    if (last && child) {
      last.children.push(child[1].trim());
      continue;
    }
    const continuation = CONTINUATION.exec(line);
    if (last && continuation) {
      if (last.children.length > 0) last.children[last.children.length - 1] += ` ${continuation[1].trim()}`;
      else last.text += ` ${continuation[1].trim()}`;
      continue;
    }
    if (list) flush();
    (paragraph ??= []).push(line.trim());
  }
  flush();
  return blocks;
}

function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  let from = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > from) parts.push({ text: text.slice(from, match.index) });
    parts.push(match[3] ? { text: match[3], strong: true } : { text: match[1], href: match[2] });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from) });
  return parts;
}

/** Kotwica nagłówka bez polskich znaków („§ 1. Definicje” → `1-definicje`), żeby dało się podać link do paragrafu. */
function anchor(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
