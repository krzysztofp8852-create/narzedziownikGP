import { describe, expect, it } from "vitest";
import { dateTimeInputValue, parseDateTimeInput } from "./dates";

describe("godzina z pola daty i godziny czasu polskiego", () => {
  it("zimą i latem pole pokazuje i czyta godzinę w Polsce", () => {
    expect(dateTimeInputValue(new Date("2026-03-02T15:30:00+01:00"))).toBe("2026-03-02T15:30");
    expect(dateTimeInputValue(new Date("2026-07-01T07:05:00+02:00"))).toBe("2026-07-01T07:05");
    expect(parseDateTimeInput("2026-03-02T15:30")).toEqual(new Date("2026-03-02T15:30:00+01:00"));
    expect(parseDateTimeInput("2026-07-01T07:05")).toEqual(new Date("2026-07-01T07:05:00+02:00"));
  });

  it("w dniu zmiany czasu godziny po obu stronach zmiany są dobre", () => {
    expect(parseDateTimeInput("2026-03-29T01:30")).toEqual(new Date("2026-03-29T01:30:00+01:00"));
    expect(parseDateTimeInput("2026-03-29T03:30")).toEqual(new Date("2026-03-29T03:30:00+02:00"));
    expect(parseDateTimeInput("2026-10-25T04:00")).toEqual(new Date("2026-10-25T04:00:00+01:00"));
  });

  it("puste albo złe pole to null", () => {
    for (const raw of ["", "2026-03-02", "15:30", "2026-02-30T10:00", "2026-03-02T25:00", "jutro"]) {
      expect(parseDateTimeInput(raw), raw).toBeNull();
    }
  });
});
