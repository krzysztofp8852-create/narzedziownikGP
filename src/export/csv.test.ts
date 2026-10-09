import { describe, expect, it } from "vitest";
import { csv } from "./csv";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("CSV eksportu danych firmy", () => {
  it("nagłówek z nazwami kolumn, potem wiersze; przecinki, a każdy wiersz kończy CRLF", () => {
    expect(text(csv(["id", "code", "name"], [["1", "S-01", "Szlifierka"], ["2", "H-03", "Młot"]]))).toBe(
      "id,code,name\r\n1,S-01,Szlifierka\r\n2,H-03,Młot\r\n",
    );
  });

  it("pole z przecinkiem, cudzysłowem albo końcem wiersza idzie w cudzysłowie, a cudzysłów się podwaja", () => {
    expect(text(csv(["note"], [["a, b"], ['Wiertarka "Bosch"'], ["ul. Polna 3\n60-001 Poznań"], [" spacja "]]))).toBe(
      'note\r\n"a, b"\r\n"Wiertarka ""Bosch"""\r\n"ul. Polna 3\n60-001 Poznań"\r\n" spacja "\r\n',
    );
  });

  it("brak wartości to puste pole, a pusty tekst to pusty cudzysłów, żeby się ich nie pomyliło", () => {
    expect(text(csv(["a", "b", "c"], [[null, "", "x"]]))).toBe('a,b,c\r\n,"",x\r\n');
  });

  it("tabela bez wierszy to sam nagłówek; UTF-8 bez BOM", () => {
    const bytes = csv(["id", "nazwa_ąę"], []);
    expect(text(bytes)).toBe("id,nazwa_ąę\r\n");
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
  });
});
