import { describe, expect, it } from "vitest";
import { parseLegalDocument } from "./parse";

const doc = (body: string, meta = "title: Regulamin\nversion: 29 września 2026\ndraft: tak") => `---\n${meta}\n---\n${body}`;

describe("dokument prawny z pliku tekstowego", () => {
  it("nagłówek pliku podaje tytuł, wersję i to, czy dokument jest jeszcze projektem", () => {
    expect(parseLegalDocument(doc(""))).toMatchObject({ title: "Regulamin", version: "29 września 2026", draft: true });
    expect(parseLegalDocument(doc("", "title: Regulamin\nversion: 1 października 2026\ndraft: nie"))).toMatchObject({ draft: false });
  });

  it("bez tytułu albo wersji dokument się nie wczyta, żeby błąd wyszedł przy budowaniu, a nie u klienta", () => {
    expect(() => parseLegalDocument("## § 1. Definicje")).toThrow(/nagłówka/);
    expect(() => parseLegalDocument(doc("", "title: Regulamin"))).toThrow(/version/);
  });

  it("literówka w polu draft nie chowa ostrzeżenia o projekcie, tylko zatrzymuje budowanie", () => {
    for (const draft of ["draft: yes", "draft: Tak ", "draft tak", ""]) {
      expect(() => parseLegalDocument(doc("", `title: Regulamin\nversion: 29 września 2026\n${draft}`)), draft).toThrow(/draft/);
    }
  });

  it("plik zapisany w edytorze ze znacznikiem BOM, końcami linii Windows i spacjami po --- dalej się wczytuje", () => {
    const source = "﻿--- \r\ntitle: Regulamin\r\nversion: 29 września 2026\r\ndraft: nie\r\n---  \r\n\r\nTreść.\r\n";
    expect(parseLegalDocument(source)).toEqual({
      title: "Regulamin",
      version: "29 września 2026",
      draft: false,
      blocks: [{ kind: "paragraph", content: [{ text: "Treść." }] }],
    });
  });

  it("paragrafy mają nagłówki z kotwicą, a akapity łączą kolejne linie do pustej linii", () => {
    const { blocks } = parseLegalDocument(doc("\n## § 1. Postanowienia ogólne\n\nPierwsza linia\ndruga linia.\n\nDrugi akapit.\n\n### Dane w UE\n"));
    expect(blocks).toEqual([
      { kind: "heading", level: 2, id: "1-postanowienia-ogolne", text: "§ 1. Postanowienia ogólne" },
      { kind: "paragraph", content: [{ text: "Pierwsza linia druga linia." }] },
      { kind: "paragraph", content: [{ text: "Drugi akapit." }] },
      { kind: "heading", level: 3, id: "dane-w-ue", text: "Dane w UE" },
    ]);
  });

  it("punkty numerowane zaczynają się od pierwszego numeru, a wcięte myślniki są ich podpunktami", () => {
    const { blocks } = parseLegalDocument(doc("3. Trzeci punkt\n   ciąg dalszy.\n4. Czwarty:\n   - podpunkt a,\n   - podpunkt b.\n"));
    expect(blocks).toEqual([
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: [
          { content: [{ text: "Trzeci punkt ciąg dalszy." }], children: [] },
          { content: [{ text: "Czwarty:" }], children: [[{ text: "podpunkt a," }], [{ text: "podpunkt b." }]] },
        ],
      },
    ]);
  });

  it("myślniki bez wcięcia to lista bez numerów", () => {
    const { blocks } = parseLegalDocument(doc("- raz\n- dwa\n\nPo liście."));
    expect(blocks).toEqual([
      { kind: "list", ordered: false, start: 1, items: [{ content: [{ text: "raz" }], children: [] }, { content: [{ text: "dwa" }], children: [] }] },
      { kind: "paragraph", content: [{ text: "Po liście." }] },
    ]);
  });

  it("odnośniki w tekście prowadzą do innych dokumentów i na adres e-mail", () => {
    const { blocks } = parseLegalDocument(doc("Zob. [politykę prywatności](/polityka-prywatnosci) i [e-mail](mailto:kontakt@gp-engineering.pl)."));
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        content: [
          { text: "Zob. " },
          { text: "politykę prywatności", href: "/polityka-prywatnosci" },
          { text: " i " },
          { text: "e-mail", href: "mailto:kontakt@gp-engineering.pl" },
          { text: "." },
        ],
      },
    ]);
  });

  it("definiowane pojęcia są wytłuszczone", () => {
    const { blocks } = parseLegalDocument(doc("1. **Klient**: przedsiębiorca (dalej: **Klient**)."));
    expect(blocks).toEqual([
      {
        kind: "list",
        ordered: true,
        start: 1,
        items: [
          {
            content: [{ text: "Klient", strong: true }, { text: ": przedsiębiorca (dalej: " }, { text: "Klient", strong: true }, { text: ")." }],
            children: [],
          },
        ],
      },
    ]);
  });
});
