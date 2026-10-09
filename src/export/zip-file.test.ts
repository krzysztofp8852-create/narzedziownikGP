import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeZipFile } from "./zip-file";

const directory = () => mkdtempSync(join(tmpdir(), "zip-file-"));
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 5000 }, (_, i) => i % 251)]);

describe("plik ZIP eksportu", () => {
  it("zapisuje pliki po kolei pod ich ścieżkami, bajt w bajt, i zwraca wynik wypełniania", async () => {
    const path = join(directory(), "eksport.zip");
    const readme = new TextEncoder().encode("# Eksport danych firmy Zażółć\n".repeat(200));

    const result = await writeZipFile(path, async (add) => {
      await add("README.md", readme);
      await add("dane/tools.csv", new TextEncoder().encode("id,code\r\n1,S-01\r\n"));
      await add("pliki/zdjecia-zgloszen/1.jpg", photo);
      return "gotowe";
    });

    expect(result).toBe("gotowe");
    const files = unzipSync(readFileSync(path));
    expect(Object.keys(files)).toEqual(["README.md", "dane/tools.csv", "pliki/zdjecia-zgloszen/1.jpg"]);
    expect(files["README.md"]).toEqual(readme);
    expect(new TextDecoder().decode(files["dane/tools.csv"])).toBe("id,code\r\n1,S-01\r\n");
    expect(files["pliki/zdjecia-zgloszen/1.jpg"]).toEqual(photo);
  });

  it("nie nadpisuje istniejącego pliku", async () => {
    const path = join(directory(), "eksport.zip");
    writeFileSync(path, "poprzedni eksport");

    await expect(writeZipFile(path, async (add) => add("README.md", new Uint8Array([1])))).rejects.toMatchObject({ code: "EEXIST" });

    expect(readFileSync(path, "utf8")).toBe("poprzedni eksport");
  });

  it("po błędzie w trakcie nie zostawia niepełnego pliku", async () => {
    const path = join(directory(), "eksport.zip");

    await expect(
      writeZipFile(path, async (add) => {
        await add("README.md", new Uint8Array([1]));
        throw new Error("Storage nie odpowiada");
      }),
    ).rejects.toThrow("Storage nie odpowiada");

    expect(existsSync(path)).toBe(false);
  });
});
