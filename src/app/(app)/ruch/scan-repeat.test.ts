import { describe, expect, it } from "vitest";
import { REPEAT_AFTER_MS, repeatFilter } from "./scan-repeat";

/** Odczyty z kolejnych klatek co 150 ms, jak w skanerze: [treść, chwila]. */
const frames = (text: string, from: number, to: number) =>
  Array.from({ length: Math.floor((to - from) / 150) + 1 }, (_, index) => [text, from + index * 150] as const);

describe("repeatFilter", () => {
  it("naklejka trzymana w kadrze liczy się raz", () => {
    const fresh = repeatFilter();
    const counted = frames("S-01", 0, 5_000).filter(([text, now]) => fresh(text, now));
    expect(counted).toEqual([["S-01", 0]]);
  });

  it("ta sama naklejka liczy się znowu dopiero po przerwie dłuższej niż REPEAT_AFTER_MS", () => {
    const fresh = repeatFilter();
    expect(fresh("S-01", 0)).toBe(true);
    expect(fresh("S-01", REPEAT_AFTER_MS)).toBe(false);
    expect(fresh("S-01", 2 * REPEAT_AFTER_MS + 1)).toBe(true);
  });

  it("inna naklejka liczy się od razu, także powrót do poprzedniej", () => {
    const fresh = repeatFilter();
    expect(fresh("S-01", 0)).toBe(true);
    expect(fresh("S-02", 150)).toBe(true);
    expect(fresh("S-01", 300)).toBe(true);
  });
});
