import { RegistryError } from "./errors";

/** Zdjęcia zgłoszeń i czatu z supportem: JPG, PNG albo WEBP do 4 MB, rozpoznawane po treści pliku. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Rozpoznane zdjęcie: typ z treści pliku, a nie z nagłówka przeglądarki. */
export interface CheckedPhoto {
  blob: Blob;
  extension: "jpg" | "png" | "webp";
}

const PHOTO_SIGNATURES: { type: string; extension: CheckedPhoto["extension"]; matches: (head: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", extension: "jpg", matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { type: "image/png", extension: "png", matches: (h) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => h[i] === byte) },
  { type: "image/webp", extension: "webp", matches: (h) => ascii(h, 0, 4) === "RIFF" && ascii(h, 8, 12) === "WEBP" },
];

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.slice(from, to));
}

/** Zdjęcie JPG, PNG albo WEBP do 4 MB; inaczej `photo_invalid`. */
export async function checkPhoto(photo: Blob): Promise<CheckedPhoto> {
  return recognize(photo, PHOTO_SIGNATURES, MAX_PHOTO_BYTES, "photo_invalid");
}

/** Plik o jednym ze znanych formatów (po pierwszych bajtach) i najwyżej `maxBytes`, z typem z treści; inaczej `error`. */
async function recognize<E extends string>(
  file: Blob,
  signatures: { type: string; extension: E; matches: (head: Uint8Array) => boolean }[],
  maxBytes: number,
  error: "photo_invalid" | "document_invalid",
): Promise<{ blob: Blob; extension: E }> {
  if (!(file instanceof Blob) || file.size === 0 || file.size > maxBytes) throw new RegistryError(error);
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signature = signatures.find(({ matches }) => matches(head));
  if (!signature) throw new RegistryError(error);
  return { blob: new Blob([file], { type: signature.type }), extension: signature.extension };
}

/** Dokumenty terminów narzędzi: PDF albo zdjęcie JPG, PNG, WEBP do 4 MB. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Rozpoznany dokument: typ z treści pliku, a nie z nagłówka przeglądarki. */
export interface CheckedDocument {
  blob: Blob;
  extension: CheckedPhoto["extension"] | "pdf";
}

const DOCUMENT_SIGNATURES = [
  ...PHOTO_SIGNATURES,
  { type: "application/pdf", extension: "pdf" as const, matches: (h: Uint8Array) => ascii(h, 0, 5) === "%PDF-" },
];

/** PDF albo zdjęcie JPG, PNG, WEBP do 4 MB; inaczej `document_invalid`. */
export async function checkDocument(file: Blob): Promise<CheckedDocument> {
  return recognize<CheckedDocument["extension"]>(file, DOCUMENT_SIGNATURES, MAX_DOCUMENT_BYTES, "document_invalid");
}
