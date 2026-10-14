/** Kawałek tekstu: zwykły, wytłuszczony albo odnośnik. */
export type Inline = { text: string; href?: string; strong?: true };

export type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3; id: string; text: string }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: { content: Inline[]; children: Inline[][] }[] };

export interface MarkdownFile {
  /** Pola nagłówka pliku (`klucz: wartość` między liniami `---`). */
  meta: Record<string, string>;
  blocks: MarkdownBlock[];
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
 * Plik tekstowy w małym podzbiorze Markdownu, który da się poprawiać wprost, bez znajomości kodu (dokumenty prawne,
 * strony modułów): nagłówek pliku z polami `klucz: wartość`, `##` i `###`, akapity, punkty `1.` z wciętymi podpunktami
 * `-`, listy `-`, odnośniki `[tekst](adres)` i wytłuszczenia `**tekst**`. `what` nazywa plik w błędach, a `required`
 * to pola nagłówka, bez których plik się nie wczyta.
 */
export function parseMarkdown(source: string, what: string, required: readonly string[]): MarkdownFile {
  // Edytor może zapisać plik ze znacznikiem BOM i końcami linii Windows.
  const normalized = source.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = FRONT_MATTER.exec(normalized);
  if (!match) throw new Error(`${what} bez nagłówka (--- ${required.join(", ")} ---)`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n").filter((line) => line.trim() !== "")) {
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`${what}: linia nagłówka bez dwukropka („${line}”)`);
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  for (const key of required) if (!meta[key]) throw new Error(`${what} bez pola ${key}`);
  return { meta, blocks: parseBlocks(normalized.slice(match[0].length)) };
}

function parseBlocks(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Wszystkie odnośniki z akapitów i list, np. do sprawdzenia w testach, że trafiają w istniejące strony. */
export function markdownLinks(blocks: MarkdownBlock[]): string[] {
  const inlines: Inline[] = blocks.flatMap((block) => {
    if (block.kind === "paragraph") return block.content;
    if (block.kind === "list") return block.items.flatMap((item) => [...item.content, ...item.children.flat()]);
    return [];
  });
  return inlines.flatMap((part) => (part.href ? [part.href] : []));
}
