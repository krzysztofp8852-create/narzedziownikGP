import { describe, expect, it } from "vitest";
import { CASES, REQUIRED_TAGS } from "./cases";
import { caseProblems } from "./eval";

describe("przypadki zestawu ewaluacyjnego", () => {
  it("co najmniej 40 przypadków z niepowtarzalnymi nazwami, pokrywających slang, liczebniki, niejednoznaczności, przeniesienia, serwis i nierozpoznane", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((evalCase) => evalCase.id)).size).toBe(CASES.length);
    for (const tag of REQUIRED_TAGS) expect(CASES.filter((evalCase) => evalCase.tags.includes(tag)), tag).not.toHaveLength(0);
  });

  it.each(CASES.map((evalCase) => [evalCase.id, evalCase] as const))("%s jest spójny ze swoją ewidencją", (_, evalCase) => {
    expect(caseProblems(evalCase)).toEqual([]);
  });
});
