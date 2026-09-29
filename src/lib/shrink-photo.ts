import { t } from "@/i18n/t";

/** Dłuższy bok zdjęcia po zmniejszeniu: wystarczy, żeby zobaczyć pęknięcie czy komunikat na zrzucie, a plik ma kilkaset KB. */
const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.82;

/**
 * Zdjęcie z telefonu (często kilka MB, na iPhonie HEIC) jako JPG o dłuższym boku najwyżej 1600 px (albo `maxSide`). Gdy
 * przeglądarka nie odczyta pliku, zwraca null i idzie oryginał; serwer sam odrzuci format, którego nie przyjmuje.
 */
export async function shrinkPhoto(photo: File, maxSide = PHOTO_MAX_SIDE): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
  } catch {
    return null;
  }
}

/**
 * Formularz z polem `photo` ze zmniejszonym zdjęciem (gdy przeglądarka umie je odczytać). `onPreparing` mówi, kiedy
 * zdjęcie się zmniejsza, żeby przycisk mógł to pokazać; bez zdjęcia nie jest wołane.
 */
export async function withShrunkPhoto(formData: FormData, onPreparing: (preparing: boolean) => void): Promise<FormData> {
  return withShrunkImage(formData, { field: "photo", maxSide: PHOTO_MAX_SIDE, fileName: () => "zdjecie.jpg" }, onPreparing);
}

/** Formularz z polem `field` ze zmniejszonym zdjęciem pod nową nazwą; inne pliki (PDF) i brak pliku zostają bez zmian. */
async function withShrunkImage(
  formData: FormData,
  options: { field: string; maxSide: number; fileName: (original: File) => string },
  onPreparing: (preparing: boolean) => void,
): Promise<FormData> {
  const file = formData.get(options.field);
  if (file instanceof File && file.size > 0 && (file.type === "" || file.type.startsWith("image/"))) {
    onPreparing(true);
    const smaller = await shrinkPhoto(file, options.maxSide);
    onPreparing(false);
    if (smaller) formData.set(options.field, smaller, options.fileName(file));
  }
  return formData;
}

/** Zdjęcie dokumentu (świadectwo, protokół) zostaje większe niż zdjęcie usterki, żeby dało się przeczytać drobny druk. */
const DOCUMENT_MAX_SIDE = 2400;

/**
 * Formularz z polem `file` (dokument terminu): zdjęcie zmniejszone do JPG z nazwą pliku zakończoną na .jpg, a PDF bez
 * zmian. `onPreparing` jak w `withShrunkPhoto`.
 */
export async function withShrunkDocument(formData: FormData, onPreparing: (preparing: boolean) => void): Promise<FormData> {
  const fileName = (original: File) => `${original.name.replace(/\.[^.]*$/, "") || t("deadlines.defaultFileName")}.jpg`;
  return withShrunkImage(formData, { field: "file", maxSide: DOCUMENT_MAX_SIDE, fileName }, onPreparing);
}
