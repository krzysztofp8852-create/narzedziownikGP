import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { posterPdf } from "./poster";

const input = {
  companyName: "Zawbud Sp. z o.o.",
  kindLabel: "Budowa",
  placeName: "Osiedle Zielone Tarasy, budynek B2 — żelbet i ściany",
  address: "ul. Szczepankowo 112, Poznań",
  url: "https://narzedziownikgp.pl/odbicie/7K3MQ9XZ2B",
  code: "7K3MQ-9XZ2B",
  texts: {
    heading: "Odbij się przy wejściu i przy wyjściu",
    codeLabel: "Kod:",
    instructions: ["Zeskanuj kod aparatem telefonu albo przyciskiem „Odbij się” na tablicy w programie.", "Program sprawdza położenie tylko w chwili skanu."],
  },
};

describe("plakat budowy", () => {
  it("to jedna strona A4 z polskimi znakami w nazwie i instrukcji", async () => {
    const pdf = await PDFDocument.load(await posterPdf(input));

    expect(pdf.getPages().map((page) => page.getSize())).toEqual([{ width: expect.closeTo(595.28, 1), height: expect.closeTo(841.89, 1) }]);
    expect(pdf.getTitle()).toBe("Budowa Osiedle Zielone Tarasy, budynek B2 — żelbet i ściany");
  });

  it("bez nazwy miejsca albo kodu plakatu nie powstaje", async () => {
    await expect(posterPdf({ ...input, placeName: " " })).rejects.toThrow();
    await expect(posterPdf({ ...input, code: "" })).rejects.toThrow();
  });
});
