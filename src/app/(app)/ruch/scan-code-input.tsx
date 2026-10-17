"use client";

import { type FormEvent, useState } from "react";
import { t } from "@/i18n/t";
import { CameraScanner } from "./camera-scanner";

/** Komunikat pod polem kodu: przyjęty kod albo błąd. */
export type ScanFeedback = { text: string; error: boolean } | null;

/**
 * Wejście Skanuj: aparat (z przyciskiem, który go wyłącza) i ręczne wpisanie kodu z naklejki albo plakatu, gdy kod QR
 * jest zniszczony albo aparatu nie ma. `onTyped` zwraca true, gdy kod przyjęto: wtedy pole się czyści. Włączony aparat
 * (`camera`) trzyma skaner, żeby wyłączony został wyłączony po odbiciu offline i przy następnym otwarciu.
 */
export function ScanCodeInput({
  onScan,
  onTyped,
  feedback,
  submitLabel,
  hint,
  camera,
  onCamera,
}: {
  onScan: (text: string) => void;
  onTyped: (text: string) => boolean;
  feedback: ScanFeedback;
  submitLabel: string;
  /** Podpowiedź pod podglądem aparatu; bez niej ta skanera ruchów. */
  hint?: string;
  camera: boolean;
  onCamera: (on: boolean) => void;
}) {
  const [typed, setTyped] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onTyped(typed)) setTyped("");
  }

  return (
    <div className="scanner-input">
      {camera && <CameraScanner onScan={onScan} hint={hint} />}
      <button className="button button-quiet" type="button" onClick={() => onCamera(!camera)}>
        {camera ? t("scanner.cameraOff") : t("scanner.cameraOn")}
      </button>
      <form className="scanner-manual" onSubmit={submit}>
        <div className="field">
          <label htmlFor="scanner-code">{t("scanner.manualCode")}</label>
          <input
            id="scanner-code"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("scanner.manualPlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="go"
          />
        </div>
        <button className="button button-quiet" type="submit" disabled={!typed.trim()}>
          {submitLabel}
        </button>
      </form>
      <p className={feedback?.error ? "scanner-feedback scanner-feedback-error" : "scanner-feedback"} aria-live="polite">
        {feedback?.text}
      </p>
    </div>
  );
}
