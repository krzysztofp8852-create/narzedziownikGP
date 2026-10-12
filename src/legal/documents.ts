/**
 * Dokumenty prawne i ich adresy. Treść jest w `messages/prawne/<id>.pl.md` (ADR 0023). „Usuń konto” to nie umowa,
 * tylko wyjaśnienie, jak poprosić o usunięcie danych (wymóg Google Play), ale tak samo otwiera się bez logowania
 * i ma odnośnik wszędzie tam, gdzie dokumenty prawne.
 */
export const LEGAL_DOCUMENTS = {
  regulamin: { path: "/regulamin" },
  "polityka-prywatnosci": { path: "/polityka-prywatnosci" },
  "umowa-powierzenia": { path: "/umowa-powierzenia" },
  "usun-konto": { path: "/usun-konto" },
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

export const LEGAL_DOCUMENT_IDS = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentId[];

export const LEGAL_PATHS: string[] = LEGAL_DOCUMENT_IDS.map((id) => LEGAL_DOCUMENTS[id].path);
