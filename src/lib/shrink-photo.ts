/** Dłuższy bok zdjęcia po zmniejszeniu: wystarczy, żeby zobaczyć pęknięcie czy komunikat na zrzucie, a plik ma kilkaset KB. */
const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.82;

/**
 * Zdjęcie z telefonu (często kilka MB, na iPhonie HEIC) jako JPG o dłuższym boku najwyżej 1600 px. Gdy
 * przeglądarka nie odczyta pliku, zwraca null i idzie oryginał; serwer sam odrzuci format, którego nie przyjmuje.
 */
export async function shrinkPhoto(photo: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
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
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    onPreparing(true);
    const smaller = await shrinkPhoto(photo);
    onPreparing(false);
    if (smaller) formData.set("photo", smaller, "zdjecie.jpg");
  }
  return formData;
}
