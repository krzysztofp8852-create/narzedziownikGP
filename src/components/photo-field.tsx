"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";

/** Formaty zdjęć, które pokazujemy w wyborze pliku; serwer sprawdza plik po treści. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/*";

/**
 * Pole zdjęcia (`photo`) z podglądem wybranego pliku i przyciskiem „Usuń zdjęcie”, żeby przed wysłaniem było widać,
 * co pójdzie. Podgląd to adres pliku w pamięci przeglądarki, zwalniany przy zmianie i zamknięciu formularza.
 */
export function PhotoField({ id, label, hint }: { id: string; label: string; hint: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  // Zamiast zdjęcia, którego przeglądarka nie pokaże (np. HEIC poza Safari), jest nazwa pliku.
  const [broken, setBroken] = useState(false);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBroken(false);
    setPhoto(file && file.size > 0 ? { url: URL.createObjectURL(file), name: file.name } : null);
  }

  function remove() {
    if (input.current) input.current.value = "";
    setPhoto(null);
    input.current?.focus();
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input ref={input} id={id} name="photo" type="file" accept={ACCEPT} aria-describedby={`${id}-hint`} onChange={change} />
      <small id={`${id}-hint`}>{hint}</small>
      {photo && (
        <div className="photo-preview" data-testid="photo-preview">
          {broken ? (
            <span className="photo-preview-name muted">{photo.name}</span>
          ) : (
            // Plik z pamięci przeglądarki; optymalizacja obrazów Next go nie zna.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt={t("photo.preview", { name: photo.name })} onError={() => setBroken(true)} />
          )}
          <button type="button" className="button button-quiet button-small" onClick={remove}>
            {t("photo.remove")}
          </button>
        </div>
      )}
    </div>
  );
}
