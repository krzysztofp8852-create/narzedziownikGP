"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { t } from "@/i18n/t";
import { hasOfflineQueue } from "@/lib/offline/idb";
import { readPoster } from "@/posters/url";
import { OfflinePunch } from "./odbicie/offline-punch";
import { CameraScanner } from "./ruch/camera-scanner";

/**
 * „Odbij się” na górze tablicy: skaner w programie (ten sam co przy naklejkach, z ręcznym wpisaniem kodu z plakatu)
 * prowadzi na stronę odbicia, tak jak kod QR plakatu zeskanowany aparatem telefonu. Bez zasięgu odbicie trafia od
 * razu do kolejki offline z chwilą skanu, a właściciel i kierownik (`punchesOthers`) odbijają też osoby z kartoteki.
 */
export function PunchButton({ userId, punchesOthers }: { userId: string; punchesOthers: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState(true);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [offlineCode, setOfflineCode] = useState<string | null>(null);

  function go(text: string) {
    const poster = readPoster(text);
    if (!poster) return setFeedback(t("punches.notPoster"));
    navigator.vibrate?.(60);
    if (hasOfflineQueue() && !navigator.onLine) {
      setFeedback(null);
      setTyped("");
      return setOfflineCode(poster.code);
    }
    router.push(`/odbicie/${poster.code}`);
  }

  function close() {
    setOfflineCode(null);
    setOpen(false);
  }

  function onTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(typed);
  }

  return (
    <section className="punch-button" aria-label={t("punches.button")}>
      <button className={open ? "button" : "button button-quiet"} type="button" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        {t("punches.button")}
      </button>
      {open && offlineCode && <OfflinePunch key={offlineCode} userId={userId} code={offlineCode} punchesOthers={punchesOthers} onClose={close} />}
      {open && !offlineCode && (
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
