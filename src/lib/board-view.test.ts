import { describe, expect, it } from "vitest";
import type { PlaceOnBoard, Tutorial } from "@/registry/registry";
import { type BoardOperation, boardCounters, boardOperations, firstStepsOnBoard, placeHref, placesOnBoard } from "./board-view";

const place = (kind: PlaceOnBoard["kind"], name: string, changes: Partial<PlaceOnBoard> = {}): PlaceOnBoard => ({
  kind,
  id: `id-${name}`,
  name,
  toolCount: 1,
  alarm: false,
  mine: false,
  ...changes,
});

describe("operacje na tablicy", () => {
  const all: BoardOperation[] = ["wydanie", "zwrot", "przeniesienie", "do_serwisu", "z_serwisu", "tekst", "narzedzie", "wynajem"];

  it("właściciel i magazynier mają na wierzchu Wydaj, Zwróć i Powiedz lub wpisz, a resztę pod „Więcej operacji”", () => {
    expect(boardOperations(all)).toEqual({
      top: ["wydanie", "zwrot", "tekst"],
      more: ["przeniesienie", "do_serwisu", "z_serwisu", "narzedzie", "wynajem"],
    });
  });

  it("kierownik ma pod „Więcej operacji” także Zgłoś narzędzie, a bez dostawcy AI na wierzchu są tylko Wydaj i Zwróć", () => {
    expect(boardOperations(["zgloszenie", "wynajem", "do_serwisu", "przeniesienie", "zwrot", "wydanie"])).toEqual({
      top: ["wydanie", "zwrot"],
      more: ["przeniesienie", "do_serwisu", "zgloszenie", "wynajem"],
    });
  });

  it("bez żadnej z częstych operacji rzadsze stoją od razu na wierzchu, bez przycisku „Więcej operacji”", () => {
    expect(boardOperations(["zgloszenie"])).toEqual({ top: ["zgloszenie"], more: [] });
    expect(boardOperations([])).toEqual({ top: [], more: [] });
  });
});

describe("liczniki tablicy", () => {
  const counts = { atBase: 12, onSites: 7, alarms: 2 };

  it("właściciel ma Na bazie, Na budowach, Alarmy i Poza bazą w zł; każdy prowadzi do przefiltrowanej listy narzędzi", () => {
    expect(boardCounters({ counts, offBaseValue: 3650.5, base: { id: "baza-1" } })).toEqual([
      { key: "atBase", value: 12, href: "/narzedzia?lokalizacja=baza-1" },
      { key: "onSites", value: 7, href: "/narzedzia?pokaz=na-budowach" },
      { key: "alarms", value: 2, href: "/narzedzia?pokaz=z-alarmem" },
      { key: "offBase", value: 3650.5, href: "/narzedzia?pokaz=poza-baza" },
    ]);
  });

  it("kierownik i magazynier nie mają licznika w zł", () => {
    expect(boardCounters({ counts, base: { id: "baza-1" } }).map((counter) => counter.key)).toEqual(["atBase", "onSites", "alarms"]);
  });
});

describe("kafle „Gdzie jest sprzęt”", () => {
  const places = [
    place("baza", "Magazyn"),
    place("budowa", "Rataje", { mine: true }),
    place("budowa", "Tarasy"),
    place("pojazd", "Bus", { mine: true }),
    place("pojazd", "Dostawczy"),
    place("serwis", "Serwis Hilti", { id: "hilti" }),
  ];
  const names = (list: PlaceOnBoard[]) => list.map((item) => item.name);

  it("kierownik widzi przede wszystkim swoje budowy i pojazdy (z bazą i serwisem), a pozostałe są zwinięte osobno", () => {
    const { main, others } = placesOnBoard("kierownik", places);

    expect(names(main)).toEqual(["Magazyn", "Rataje", "Bus", "Serwis Hilti"]);
    expect(names(others)).toEqual(["Tarasy", "Dostawczy"]);
  });

  it("właściciel i magazynier widzą wszystkie miejsca na jednej siatce", () => {
    for (const role of ["wlasciciel", "magazynier"] as const) {
      expect(placesOnBoard(role, places)).toEqual({ main: places, others: [] });
    }
  });

  it("kafel prowadzi do strony bazy, budowy albo pojazdu, a serwis (bez własnej strony) do listy narzędzi w nim", () => {
    expect(places.map(placeHref)).toEqual([
      "/baza",
      "/budowy/id-Rataje",
      "/budowy/id-Tarasy",
      "/pojazdy/id-Bus",
      "/pojazdy/id-Dostawczy",
      "/narzedzia?lokalizacja=hilti",
    ]);
  });
});

describe("„Uruchom firmę w 4 krokach” na tablicy", () => {
  const steps = (done: number): Tutorial["firstSteps"] =>
    (["kierownik", "budowa", "narzedzia", "naklejki"] as const).map((id, index) => ({ id, done: index < done }));
  const owner = (changes: Partial<Tutorial> = {}): Tutorial => ({ role: "wlasciciel", closed: null, firstSteps: steps(1), ...changes });

  it("stoi u właściciela, dopóki nie pominie albo nie ukończy wszystkich kroków", () => {
    expect(firstStepsOnBoard(owner())).toBe(true);
    expect(firstStepsOnBoard(owner({ closed: "pominiety" }))).toBe(false);
    expect(firstStepsOnBoard(owner({ closed: "ukonczony" }))).toBe(false);
    expect(firstStepsOnBoard(owner({ firstSteps: steps(4) }))).toBe(false);
  });

  it("kierownik i magazynier go nie mają; demo i pracownik nie mają samouczka wcale", () => {
    expect(firstStepsOnBoard(owner({ role: "kierownik" }))).toBe(false);
    expect(firstStepsOnBoard(owner({ role: "magazynier" }))).toBe(false);
    expect(firstStepsOnBoard(null)).toBe(false);
  });
});
