import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/** Dodaje plik do ZIP-u pod ścieżką `name` (z ukośnikami). */
export type AddToZip = (name: string, content: Uint8Array) => Promise<void>;

/** Tekst (CSV, README) się kompresuje; zdjęcia i PDF-y są już skompresowane, więc idą bez zmian. */
const COMPRESSIBLE = /\.(csv|md)$/i;

/**
 * Nowy plik ZIP pod `path`, wypełniany po kolei przez `fill`. Pliki idą na dysk od razu, więc całe archiwum nie musi
 * mieścić się w pamięci. Istniejącego pliku nie nadpisuje (`EEXIST`), a po błędzie w trakcie usuwa niepełny.
 */
export async function writeZipFile<T>(path: string, fill: (add: AddToZip) => Promise<T>): Promise<T> {
  const out = createWriteStream(path, { flags: "wx" });
  await once(out, "open");
  let failure: Error | null = null;
  out.on("error", (error) => (failure ??= error));
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure ??= error;
      return;
    }
    if (out.destroyed) return;
    out.write(chunk);
    if (final) out.end();
  });
  try {
    const result = await fill(async (name, content) => {
      if (failure) throw failure;
      const entry = COMPRESSIBLE.test(name) ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(entry);
      entry.push(content, true);
      if (out.writableNeedDrain) await once(out, "drain");
    });
    zip.end();
    await finished(out);
    if (failure) throw failure;
    return result;
  } catch (error) {
    zip.terminate();
    out.destroy();
    await rm(path, { force: true });
    throw error;
  }
}
