import { describe, expect, it } from "vitest";
import { formatPhone, phoneHref } from "./phone";

describe("numer telefonu", () => {
  it("polski numer w grupach po trzy cyfry, z kierunkowym albo bez", () => {
    expect(formatPhone("+48608177748")).toBe("+48 608 177 748");
    expect(formatPhone("+48 608-177-748")).toBe("+48 608 177 748");
    expect(formatPhone("608177748")).toBe("608 177 748");
  });

  it("innego formatu nie zmienia", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("61 852 00 00 wew. 12")).toBe("61 852 00 00 wew. 12");
  });

  it("odnośnik do dzwonienia ma surowy numer", () => {
    expect(phoneHref("+48 608 177 748")).toBe("tel:+48608177748");
  });
});
