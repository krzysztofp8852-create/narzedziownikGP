import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { stickerSheetPdf } from "./sheet";

const A4 = { width: 595.28, height: 841.89 };

function stickers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    code: `H-${String(i + 1).padStart(2, "0")}`,
    url: `https://narzedziownik.test/narzedzia/00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  }));
}

async function pagesOf(file: Uint8Array) {
  const pdf = await PDFDocument.load(file);
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 };
  });
}

describe("arkusz naklejek", () => {
  it("40 naklejek 52,5 × 29,7 mm mieści się na jednym arkuszu A4, 41. zaczyna drugi", async () => {
    const one = await stickerSheetPdf({ companyName: "Zawbud", stickers: stickers(40), layout: "a4-40" });
    const two = await stickerSheetPdf({ companyName: "Zawbud", stickers: stickers(41), layout: "a4-40" });

    expect(await pagesOf(one)).toEqual([A4]);
    expect(await pagesOf(two)).toEqual([A4, A4]);
  });

  it("druk od wskazanej pozycji zużywa resztę napoczętego arkusza: 2 naklejki od 8. miejsca z 8 zajmują dwa arkusze", async () => {
    const file = await stickerSheetPdf({ companyName: "Zawbud", stickers: stickers(2), layout: "a4-8", firstPosition: 8 });

    expect(await pagesOf(file)).toEqual([A4, A4]);
  });

  it("pozycja spoza arkusza albo brak naklejek to błąd", async () => {
    await expect(stickerSheetPdf({ companyName: "Zawbud", stickers: stickers(1), layout: "a4-8", firstPosition: 9 })).rejects.toThrow();
    await expect(stickerSheetPdf({ companyName: "Zawbud", stickers: stickers(1), layout: "a4-8", firstPosition: 0 })).rejects.toThrow();
    await expect(stickerSheetPdf({ companyName: "Zawbud", stickers: [], layout: "a4-8" })).rejects.toThrow();
  });
});
