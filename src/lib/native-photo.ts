import { nativePlugin } from "./platform";

/** Wtyczka aparatu w skorupie aplikacji (`@capacitor/camera` w `mobile/`). */
export const CAMERA = "Camera";

/**
 * Zdjęcie, jak oddaje je wtyczka. `webPath` to plik na telefonie pod adresem strony (`/_capacitor_file_/…`), który
 * skorupa podaje stronie jak zwykły plik.
 */
interface MediaResult {
  webPath?: string;
}

/** To, czego pola zdjęć używają z wtyczki: zdjęcie z aparatu i jedno zdjęcie z galerii, bez edycji. */
interface CameraPlugin {
  takePhoto(options: { saveToGallery: false; editable: "no" }): Promise<MediaResult>;
  /** `mediaType: 0` to same zdjęcia, bez filmów. */
  chooseFromGallery(options: { mediaType: 0; allowMultipleSelection: false; editable: "no" }): Promise<{ results: MediaResult[] }>;
}

export type PhotoSource = "camera" | "gallery";

/** Czemu nie ma zdjęcia: odmowa zgody na aparat albo na zdjęcia (Android 9 i starsze) albo inny błąd. */
export type NativePhotoProblem = "cameraDenied" | "galleryDenied" | "failed";

/** Kody błędów wtyczki (`OS-PLUG-CAMR-…`, README `@capacitor/camera`); inne kody to „nie udało się”. */
const PROBLEMS: Record<string, NativePhotoProblem | null> = {
  "OS-PLUG-CAMR-0003": "cameraDenied",
  "OS-PLUG-CAMR-0005": "galleryDenied",
  // Anulowane zdjęcie i anulowany wybór w galerii: użytkownik się rozmyślił, nie ma o czym mówić.
  "OS-PLUG-CAMR-0006": null,
  "OS-PLUG-CAMR-0020": null,
};

/** Rozszerzenie pliku po typie z treści: „jpg” dla JPEG jak z aparatu, inaczej podtyp (png, webp, heic). */
const extension = (type: string) => (type === "image/jpeg" ? "jpg" : type.replace(/^image\//, "") || "jpg");

/**
 * Zdjęcie z natywnego aparatu albo galerii jako plik `name.<rozszerzenie>`, gotowy do pola pliku formularza (dalej
 * idzie przez zwykłe zmniejszanie zdjęć). O zgodę na aparat wtyczka pyta sama przy pierwszym zdjęciu. Anulowanie daje
 * null, a odmowa zgody i błędy problem do pokazania.
 */
export async function nativePhoto(source: PhotoSource, name: string): Promise<{ file: File } | { problem: NativePhotoProblem } | null> {
  const camera = nativePlugin<CameraPlugin>(CAMERA);
  if (!camera) return { problem: "failed" };
  let photo: MediaResult | undefined;
  try {
    photo =
      source === "camera"
        ? await camera.takePhoto({ saveToGallery: false, editable: "no" })
        : (await camera.chooseFromGallery({ mediaType: 0, allowMultipleSelection: false, editable: "no" })).results[0];
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const problem = typeof code === "string" && code in PROBLEMS ? PROBLEMS[code] : "failed";
    return problem && { problem };
  }
  if (!photo) return null;
  try {
    if (!photo.webPath) throw new Error("Zdjęcie bez adresu pliku");
    const response = await fetch(photo.webPath);
    if (!response.ok) throw new Error(`Plik zdjęcia: ${response.status}`);
    const content = await response.blob();
    const type = content.type || "image/jpeg";
    return { file: new File([content], `${name}.${extension(type)}`, { type }) };
  } catch {
    return { problem: "failed" };
  }
}
