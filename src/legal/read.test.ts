import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "./documents";
import type { Inline, LegalDocument } from "./parse";
import { readLegalDocument } from "./read";

const documents = await Promise.all(LEGAL_DOCUMENT_IDS.map(async (id) => ({ id, document: await readLegalDocument(id) })));

function links(blocks: LegalDocument["blocks"]): string[] {
  const inlines: Inline[] = blocks.flatMap((block) => {
    if (block.kind === "paragraph") return block.content;
    if (block.kind === "list") return block.items.flatMap((item) => [...item.content, ...item.children.flat()]);
    return [];
  });
  return inlines.flatMap((part) => (part.href ? [part.href] : []));
}

describe("dokumenty prawne w plikach tłumaczeń", () => {
  it.each(documents)("$id wczytuje się z tytułem, wersją i paragrafami", ({ document }) => {
    expect(document.title).not.toBe("");
    expect(document.version).not.toBe("");
    expect(document.blocks.filter((block) => block.kind === "heading").length).toBeGreaterThan(3);
  });

  it.each(documents)("$id ma różne kotwice nagłówków, żeby odnośnik trafiał w jeden paragraf", ({ document }) => {
    const ids = document.blocks.flatMap((block) => (block.kind === "heading" ? [block.id] : []));
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("odnośniki między dokumentami prowadzą do istniejących stron i paragrafów", () => {
    const byPath = new Map<string, LegalDocument>(documents.map(({ id, document }) => [LEGAL_DOCUMENTS[id].path, document]));
    for (const { document } of documents) {
      for (const href of links(document.blocks).filter((href) => href.startsWith("/"))) {
        const [path, fragment] = href.split("#");
        if (path === "/") continue;
        const target = byPath.get(path);
        expect(target, href).toBeDefined();
        if (fragment) expect(target!.blocks.some((block) => block.kind === "heading" && block.id === fragment), href).toBe(true);
      }
    }
  });
});
