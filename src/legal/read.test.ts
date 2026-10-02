import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "./documents";
import { type Inline, type LegalDocument, parseLegalDocument } from "./parse";
import { LEGAL_MESSAGES_DIR, readLegalDocument } from "./read";

const documents = await Promise.all(LEGAL_DOCUMENT_IDS.map(async (id) => ({ id, document: await readLegalDocument(id) })));
/**
 * Wzór informacji dla pracowników o odbijaniu na budowie: ten sam format, ale bez własnej strony, dopóki nie ma
 * odbijania (#87).
 */
const workerNotice = {
  id: "informacja-o-odbijaniu",
  document: parseLegalDocument(await readFile(join(LEGAL_MESSAGES_DIR, "informacja-o-odbijaniu.pl.md"), "utf8")),
};
const allDocuments = [...documents, workerNotice];

function links(blocks: LegalDocument["blocks"]): string[] {
  const inlines: Inline[] = blocks.flatMap((block) => {
    if (block.kind === "paragraph") return block.content;
    if (block.kind === "list") return block.items.flatMap((item) => [...item.content, ...item.children.flat()]);
    return [];
  });
  return inlines.flatMap((part) => (part.href ? [part.href] : []));
}

describe("dokumenty prawne w plikach tłumaczeń", () => {
  it.each(allDocuments)("$id wczytuje się z tytułem, wersją i paragrafami", ({ document }) => {
    expect(document.title).not.toBe("");
    expect(document.version).not.toBe("");
    expect(document.blocks.filter((block) => block.kind === "heading").length).toBeGreaterThan(3);
  });

  it.each(allDocuments)("$id ma różne kotwice nagłówków, żeby odnośnik trafiał w jeden paragraf", ({ document }) => {
    const ids = document.blocks.flatMap((block) => (block.kind === "heading" ? [block.id] : []));
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("odnośniki między dokumentami prowadzą do istniejących stron i paragrafów", () => {
    const byPath = new Map<string, LegalDocument>(documents.map(({ id, document }) => [LEGAL_DOCUMENTS[id].path, document]));
    for (const { document } of allDocuments) {
      for (const href of links(document.blocks).filter((href) => href.startsWith("/"))) {
        const [path, fragment] = href.split("#");
        if (path === "/") continue;
        const target = byPath.get(path);
        expect(target, href).toBeDefined();
        if (fragment) expect(target!.blocks.some((block) => block.kind === "heading" && block.id === fragment), href).toBe(true);
      }
    }
  });

  it("wzór informacji o odbijaniu jest projektem, dopóki nie przejrzy go prawnik", () => {
    expect(workerNotice.document.draft).toBe(true);
  });
});
