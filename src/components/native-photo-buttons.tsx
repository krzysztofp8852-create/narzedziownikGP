"use client";

import { useState } from "react";
import { t } from "@/i18n/t";
import { CAMERA, nativePhoto, type NativePhotoProblem, type PhotoSource } from "@/lib/native-photo";
import { useHasPlugin } from "@/lib/platform";

/**
 * „Zrób zdjęcie” i „Z galerii” w aplikacji z wtyczką aparatu: WebView sam daje przy polu pliku tylko wybór pliku, bez
 * aparatu. Zdjęcie trafia do pola pliku `inputId`, jakby wybrano je z pliku, więc formularz zmniejsza je i wysyła jak
 * dotąd. W przeglądarce i w aplikacji bez wtyczki nic nie pokazuje, a zostaje samo pole pliku.
 */
export function NativePhotoButtons({ inputId, name }: { inputId: string; name: string }) {
  const available = useHasPlugin(CAMERA);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<NativePhotoProblem | null>(null);
  if (!available) return null;

  async function pick(source: PhotoSource) {
    setBusy(true);
    setProblem(null);
    const photo = await nativePhoto(source, name);
    setBusy(false);
    if (!photo) return;
    if ("problem" in photo) return setProblem(photo.problem);
    const field = document.getElementById(inputId);
    if (!(field instanceof HTMLInputElement)) return;
    const files = new DataTransfer();
    files.items.add(photo.file);
    field.files = files.files;
    // Pole nie zgłasza zmiany samo, gdy pliki ustawia skrypt; podgląd zdjęcia na nią czeka.
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <>
      <div className="native-photo-buttons">
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => pick("camera")}>
          {t("photo.takePhoto")}
        </button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => pick("gallery")}>
          {t("photo.fromGallery")}
        </button>
      </div>
      {problem && (
        <p className="form-error" role="alert">
          {t(`photo.problems.${problem}`)}
        </p>
      )}
    </>
  );
}
