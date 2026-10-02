"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { t } from "@/i18n/t";
import { readPoster } from "@/posters/url";
import { CameraScanner } from "./ruch/camera-scanner";

/**
 * „Odbij się” na górze tablicy: skaner w programie (ten sam co przy naklejkach, z ręcznym wpisaniem kodu z plakatu)
 * prowadzi na stronę odbicia, tak jak kod QR plakatu zeskanowany aparatem telefonu.
 */
export function PunchButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState(true);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  function go(text: string) {
    const poster = readPoster(text);
    if (!poster) return setFeedback(t("punches.notPoster"));
    navigator.vibrate?.(60);
    router.push(`/odbicie/${poster.code}`);
  }

  function onTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(typed);
  }

  return (
    <section className="punch-button" aria-label={t("punches.button")}>
      <button className={open ? "button" : "button button-quiet"} type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {t("punches.button")}
      </button>
      {open && (
        <div className="scanner-input">
          {camera && <CameraScanner onScan={go} hint={t("punches.cameraHint")} />}
          <button className="button button-quiet" type="button" onClick={() => setCamera((on) => !on)}>
            {camera ? t("scanner.cameraOff") : t("scanner.cameraOn")}
          </button>
          <form className="scanner-manual" onSubmit={onTyped}>
            <div className="field">
              <label htmlFor="punch-code">{t("punches.manualCode")}</label>
              <input
                id="punch-code"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t("punches.manualPlaceholder")}
                autoComplete="off"
                autoCapitalize="characters"
                enterKeyHint="go"
              />
            </div>
            <button className="button button-quiet" type="submit" disabled={!typed.trim()}>
              {t("punches.manualGo")}
            </button>
          </form>
          <p className={feedback ? "scanner-feedback scanner-feedback-error" : "scanner-feedback"} aria-live="polite">
            {feedback}
          </p>
        </div>
      )}
    </section>
  );
}
