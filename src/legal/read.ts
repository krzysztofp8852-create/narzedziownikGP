import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LegalDocumentId } from "./documents";
import { type LegalDocument, parseLegalDocument } from "./parse";

/** Folder z treścią dokumentów; `next.config.ts` dołącza go do wdrożenia. */
const LEGAL_MESSAGES_DIR = "messages/prawne";

/** Dokument prawny po polsku z `messages/prawne/<id>.pl.md`. */
export async function readLegalDocument(id: LegalDocumentId): Promise<LegalDocument> {
  const source = await readFile(path.join(process.cwd(), LEGAL_MESSAGES_DIR, `${id}.pl.md`), "utf8");
  return parseLegalDocument(source);
}
