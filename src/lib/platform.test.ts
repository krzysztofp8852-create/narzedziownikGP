import { describe, expect, it } from "vitest";
import { installOffer } from "./platform";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
// iPad od iPadOS 13 przedstawia się jak Mac; zdradza go ekran dotykowy.
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const browser = { maxTouchPoints: 0, standalone: false, inApp: false };

describe("propozycja instalacji", () => {
  it("Android dostaje aplikację z Google Play, telefon i tablet", () => {
    expect(installOffer({ ...browser, userAgent: ANDROID, maxTouchPoints: 5 })).toBe("google-play");
    expect(installOffer({ ...browser, userAgent: ANDROID_TABLET, maxTouchPoints: 5 })).toBe("google-play");
  });

  it("iPhone i iPad dostają instrukcję dodania do ekranu głównego", () => {
    expect(installOffer({ ...browser, userAgent: IPHONE, maxTouchPoints: 5 })).toBe("ekran-glowny");
    expect(installOffer({ ...browser, userAgent: IPAD, maxTouchPoints: 5 })).toBe("ekran-glowny");
  });

  it("komputer nie dostaje nic", () => {
    expect(installOffer({ ...browser, userAgent: MAC })).toBeNull();
    expect(installOffer({ ...browser, userAgent: WINDOWS })).toBeNull();
  });

  it("w aplikacji i w zainstalowanej PWA nie ma czego instalować", () => {
    expect(installOffer({ ...browser, userAgent: ANDROID, maxTouchPoints: 5, inApp: true })).toBeNull();
    expect(installOffer({ ...browser, userAgent: ANDROID, maxTouchPoints: 5, standalone: true })).toBeNull();
    expect(installOffer({ ...browser, userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBeNull();
  });
});
