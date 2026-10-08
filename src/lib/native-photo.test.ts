import { afterEach, describe, expect, it } from "vitest";
import { nativePhoto } from "./native-photo";

/** Plik ze zdjęciem pod adresem, który fetch odczyta bez sieci (w aplikacji to `/_capacitor_file_/…`). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = "data:image/jpeg;base64,/9j/2wBDAP////////////////////////////////////////////////////////////////////////////////////8=";

const calls: { method: string; options: unknown }[] = [];

/** Mostek aplikacji z wtyczką aparatu, której metody robią to, co podano. */
function app(camera: Record<string, (options: unknown) => Promise<unknown>>) {
  const Camera = Object.fromEntries(
    Object.entries(camera).map(([method, run]) => [method, (options: unknown) => (calls.push({ method, options }), run(options))]),
  );
  Object.assign(globalThis, {
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: (name: string) => name === "Camera", Plugins: { Camera } },
  });
}

const rejected = (code: string) => () => Promise.reject({ message: "Błąd wtyczki", code });

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
  calls.length = 0;
});

describe("nativePhoto", () => {
  it("zdjęcie z aparatu to plik z typem i rozszerzeniem z treści, pod podaną nazwą", async () => {
    app({ takePhoto: async () => ({ type: 0, webPath: JPEG, saved: false }) });

    const photo = await nativePhoto("camera", "dokument");

    expect(photo && "file" in photo && [photo.file.name, photo.file.type]).toEqual(["dokument.jpg", "image/jpeg"]);
    expect(calls).toEqual([{ method: "takePhoto", options: { saveToGallery: false, editable: "no" } }]);
  });

  it("zdjęcie z galerii: tylko zdjęcia, jedno", async () => {
    app({ chooseFromGallery: async () => ({ results: [{ type: 0, webPath: PNG, saved: false }] }) });

    const photo = await nativePhoto("gallery", "zdjecie");

    expect(photo && "file" in photo && [photo.file.name, photo.file.type, photo.file.size > 0]).toEqual(["zdjecie.png", "image/png", true]);
    expect(calls).toEqual([{ method: "chooseFromGallery", options: { mediaType: 0, allowMultipleSelection: false, editable: "no" } }]);
  });

  it("anulowane zdjęcie i wybór w galerii to nic, bez komunikatu", async () => {
    app({ takePhoto: rejected("OS-PLUG-CAMR-0006"), chooseFromGallery: rejected("OS-PLUG-CAMR-0020") });

    expect(await nativePhoto("camera", "zdjecie")).toBeNull();
    expect(await nativePhoto("gallery", "zdjecie")).toBeNull();
  });

  it("galeria bez wybranego zdjęcia to nic", async () => {
    app({ chooseFromGallery: async () => ({ results: [] }) });

    expect(await nativePhoto("gallery", "zdjecie")).toBeNull();
  });

  it("odmowa zgody na aparat albo na zdjęcia to osobne problemy, a inny błąd to „nie udało się”", async () => {
    app({ takePhoto: rejected("OS-PLUG-CAMR-0003"), chooseFromGallery: rejected("OS-PLUG-CAMR-0005") });
    expect(await nativePhoto("camera", "zdjecie")).toEqual({ problem: "cameraDenied" });
    expect(await nativePhoto("gallery", "zdjecie")).toEqual({ problem: "galleryDenied" });

    app({ takePhoto: rejected("OS-PLUG-CAMR-0007"), chooseFromGallery: async () => ({ results: [{ type: 0, saved: false }] }) });
    expect(await nativePhoto("camera", "zdjecie")).toEqual({ problem: "failed" });
    expect(await nativePhoto("gallery", "zdjecie")).toEqual({ problem: "failed" });
  });

  it("plik, którego nie da się odczytać, to „nie udało się”", async () => {
    app({ takePhoto: async () => ({ type: 0, webPath: "http://127.0.0.1:9/_capacitor_file_/brak.jpg", saved: false }) });

    expect(await nativePhoto("camera", "zdjecie")).toEqual({ problem: "failed" });
  });

  it("bez wtyczki aparatu (przeglądarka, starsza aplikacja) to „nie udało się”", async () => {
    expect(await nativePhoto("camera", "zdjecie")).toEqual({ problem: "failed" });
  });
});
