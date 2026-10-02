"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { locate } from "@/lib/locate";
import { isNetworkError } from "@/lib/offline/client";
import { hasOfflineQueue } from "@/lib/offline/idb";
import { afterOutcome, afterPreview, loadPunchState, savePunchState } from "@/lib/offline/punch-state";
import { punchCheckText } from "@/lib/punch-text";
import { normalizePosterCode } from "@/registry/poster-code";
import type { Punch, PunchPreview, SavedPunchOutcome } from "@/registry/registry";
import { punch, type PunchState } from "../actions";
import { queuePunch } from "../offline-punch";

type Step =
  | { kind: "confirm" }
  | { kind: "working"; text: string }
  | { kind: "done"; outcome: SavedPunchOutcome }
  | { kind: "queued"; text: string }
  | { kind: "error"; text: string };

/**
 * Odbicie po skanie plakatu: wejście i przejście zapisują się od razu, a wyjście z tej samej budowy dopiero po
 * „Tak, kończę”. Położenie bierzemy tylko teraz, w chwili skanu. Gdy połączenie zerwie się w trakcie, odbicie
 * trafia do kolejki offline pod tym samym identyfikatorem operacji, więc jeśli jednak doszło, się nie zdubluje.
 * Telefon zapamiętuje własny stan, żeby bez sieci zapytać „Kończysz?”.
 */
export function PunchFlow({ userId, code, preview, operationId }: { userId: string; code: string; preview: PunchPreview; operationId: string }) {
  const [step, setStep] = useState<Step>(preview.action === "wyjscie" ? { kind: "confirm" } : { kind: "working", text: t("punches.locating") });
  const started = useRef(false);
  const posterCode = normalizePosterCode(code) ?? code;

  async function send(confirmExit: boolean) {
    const scannedAt = new Date();
    setStep({ kind: "working", text: t("punches.locating") });
    const position = await locate();
    setStep({ kind: "working", text: t("punches.saving") });
    let result: PunchState;
    try {
      result = await punch({ posterToken: code, operationId, position, confirmExit });
    } catch (error) {
      if (!hasOfflineQueue() || !isNetworkError(error)) return setStep({ kind: "error", text: t("errors.unexpected") });
      const action = confirmExit ? "wyjscie" : preview.action;
      return setStep({ kind: "queued", text: await queuePunch({ userId, code: posterCode, operationId, action, scannedAt, position }) });
    }
    if (result.error || !result.outcome) return setStep({ kind: "error", text: result.error ?? t("errors.unexpected") });
    // Ktoś w międzyczasie odbił wejście na tej budowie (np. drugi telefon): pytamy jak przy wyjściu.
    if (result.outcome.action === "potwierdz_wyjscie") return setStep({ kind: "confirm" });
    const saved = { action: result.outcome.action, place: result.outcome.punch.place };
    savePunchState(userId, afterOutcome(loadPunchState(userId), posterCode, saved, new Date()));
    navigator.vibrate?.(60);
    setStep({ kind: "done", outcome: result.outcome });
  }

  useEffect(() => {
    // Serwer wie najlepiej, gdzie osoba jest odbita; telefon poprawia według niego własny stan.
    savePunchState(userId, afterPreview(loadPunchState(userId), posterCode, preview, new Date()));
    if (preview.action === "wyjscie" || started.current) return;
    started.current = true;
    void send(false);
    // Tylko raz, przy otwarciu strony z plakatu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="company-card punch-flow" aria-labelledby="punch-place">
      <h2 id="punch-place" className="display section-title">
        {preview.place.kind === "baza" ? t("locationPage.baseKind") : t("locationPage.siteKind")} {preview.place.name}
      </h2>
      {step.kind === "confirm" && (
        <div className="stack-form">
          <p>{t("punches.confirmExit")}</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={() => void send(true)}>
              {t("punches.confirmExitYes")}
            </button>
            <Link className="button button-quiet" href="/">
              {t("punches.confirmExitNo")}
            </Link>
          </div>
        </div>
      )}
      {step.kind === "working" && <p aria-live="polite">{step.text}</p>}
      {step.kind === "error" && (
        <>
          <p className="form-error" role="alert">
            {step.text}
          </p>
          <p>
            <Link href="/">{t("punches.toBoard")}</Link>
          </p>
        </>
      )}
      {step.kind === "done" && <PunchDone outcome={step.outcome} />}
      {step.kind === "queued" && (
        <>
          <p role="status" data-testid="punch-queued">
            {step.text}
          </p>
          <p>
            <Link href="/">{t("punches.toBoard")}</Link>
          </p>
        </>
      )}
      <p className="muted">{t("punches.privacy")}</p>
    </section>
  );
}

function PunchDone({ outcome }: { outcome: SavedPunchOutcome }) {
  const at = (punch: Punch) => formatTime(outcome.action === "wyjscie" ? punch.leftAt! : punch.enteredAt);
  const text =
    outcome.action === "wejscie"
      ? t("punches.doneEntry", { place: outcome.punch.place.name, time: at(outcome.punch) })
      : outcome.action === "wyjscie"
        ? t("punches.doneExit", { place: outcome.punch.place.name, time: at(outcome.punch) })
        : t("punches.doneTransfer", { from: outcome.left.place.name, place: outcome.punch.place.name, time: at(outcome.punch) });
  const check = outcome.action === "wyjscie" ? outcome.punch.exit : outcome.punch.entry;
  return (
    <>
      <p role="status" data-testid="punch-done">
        {text}
      </p>
      {check && (
        <p className={check.result === "na_budowie" ? "muted" : "text-danger"} data-testid="punch-check">
          {check.result === "na_budowie" ? punchCheckText(check) : t("punches.flagged", { check: punchCheckText(check) })}
        </p>
      )}
      <p>
        <Link className="button button-quiet" href="/">
          {t("punches.toBoard")}
        </Link>
      </p>
    </>
  );
}
