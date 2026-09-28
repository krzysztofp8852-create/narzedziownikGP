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
  if (!(photo instanceof Blob) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES) throw new RegistryError("photo_invalid");
  const head = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
  const signature = PHOTO_SIGNATURES.find(({ matches }) => matches(head));
  if (!signature) throw new RegistryError("photo_invalid");
  return { blob: new Blob([photo], { type: signature.type }), extension: signature.extension };
}
