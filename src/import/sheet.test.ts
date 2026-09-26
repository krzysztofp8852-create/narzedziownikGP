import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import { guessMapping, mapRows } from "./columns";
import { readSheetFile } from "./sheet";

const utf8 = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("odczyt pliku", () => {
  it("CSV z Excela: średnik, cudzysłowy, BOM, CRLF i puste wiersze", async () => {
    const csv = '﻿Kod;Nazwa;Wartość (zł)\r\n;"Młot ""duży""; Hilti";"3 200,50"\r\n;;\r\nS-01;Szlifierka;\r\n';

    expect(await readSheetFile({ name: "narzedzia.CSV", data: utf8(csv) })).toEqual({
      headers: ["Kod", "Nazwa", "Wartość (zł)"],
      rows: [
        { line: 2, cells: ["", 'Młot "duży"; Hilti', "3 200,50"] },
        { line: 4, cells: ["S-01", "Szlifierka", ""] },
      ],
    });
  });

  it("CSV z przecinkiem i polskimi znakami w Windows-1250", async () => {
    // „Młot” i „Łódź” w Windows-1250: ł = 0xB3, Ł = 0xA3, ó = 0xF3, ź = 0x9F.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Nazwa,Lokalizacja\nM"),
      0xb3,
      ...new TextEncoder().encode("ot,"),
      0xa3,
      0xf3,
      ...new TextEncoder().encode("d"),
      0x9f,
      ...new TextEncoder().encode("\n"),
    ]);

    const sheet = await readSheetFile({ name: "lista.csv", data: bytes.buffer });

    expect(sheet.rows).toEqual([{ line: 2, cells: ["Młot", "Łódź"] }]);
  });

  it("XLSX: pierwszy arkusz, liczby jako tekst z pliku", async () => {
    const file = await writeXlsxFile([
      [{ value: "Kod" }, { value: "Nazwa" }, { value: "Wartość" }],
      [{ value: "0012" }, { value: "Młot" }, { value: 3200.5, type: Number }],
      [null, { value: "Szlifierka" }, { value: 450, type: Number }],
    ]).toBuffer();

    const sheet = await readSheetFile({ name: "narzedzia.xlsx", data: new Uint8Array(file).buffer });

    expect(sheet).toEqual({
      headers: ["Kod", "Nazwa", "Wartość"],
      rows: [
        { line: 2, cells: ["0012", "Młot", "3200.5"] },
        { line: 3, cells: ["", "Szlifierka", "450"] },
      ],
    });
  });

  it("odrzuca inne formaty, uszkodzony XLSX i plik bez wierszy danych", async () => {
    await expect(readSheetFile({ name: "lista.pdf", data: utf8("x") })).rejects.toMatchObject({ code: "unsupported" });
    await expect(readSheetFile({ name: "lista.xlsx", data: utf8("to nie jest xlsx") })).rejects.toMatchObject({ code: "unreadable" });
    await expect(readSheetFile({ name: "lista.csv", data: utf8("Nazwa;Kod\n;\n") })).rejects.toMatchObject({ code: "empty" });
  });
});

describe("mapowanie kolumn", () => {
  it("rozpoznaje nagłówki bez względu na wielkość liter i polskie znaki, a nieznane pomija", () => {
    const mapping = guessMapping(["Nr seryjny", "NAZWA", "Kategoria", "Uwagi", "Wartość (zł)", "Budowa", "Kod", "Marka", "Model", "Nazwa"]);

    expect(mapping).toEqual({
      code: 6,
      name: 1,
      category: 2,
      brand: 7,
      model: 8,
      serialNumber: 0,
      value: 4,
      location: 5,
    });
  });

  it("wiersze pliku stają się polami karty; pola bez kolumny zostają puste", () => {
    const sheet = {
      headers: ["Nazwa", "Kategoria", "Wartość"],
      rows: [
        { line: 2, cells: ["Młot", "Młoty", "3200"] },
        { line: 3, cells: ["Szlifierka"] },
      ],
    };

    expect(mapRows(sheet, { ...guessMapping(sheet.headers), location: 1 })).toEqual([
      { name: "Młot", category: "Młoty", value: "3200", location: "Młoty" },
      { name: "Szlifierka", category: "", value: "", location: "" },
    ]);
  });
});
