import { describe, expect, it } from "vitest";
import { demoDevice } from "./demo-device";

describe("urządzenie oglądającego demo", () => {
  it("rozpoznaje telefon, tablet i komputer", () => {
    expect(demoDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("telefon");
    expect(demoDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("telefon");
    expect(demoDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("tablet");
    expect(demoDevice("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("tablet");
    expect(demoDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("komputer");
    expect(demoDevice(null)).toBe("komputer");
  });
});
