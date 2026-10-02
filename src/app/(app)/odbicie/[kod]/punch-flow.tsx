"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { punchCheckText } from "@/lib/punch-text";
import type { PhonePosition, Punch, PunchOutcome, PunchPreview } from "@/registry/registry";
import { punch } from "../actions";

type Step = { kind: "confirm" } | { kind: "working"; text: string } | { kind: "done"; outcome: Exclude<PunchOutcome, { action: "potwierdz_wyjscie" }> } | { kind: "error"; text: string };

/** Położenie telefonu w chwili skanu; null, gdy przeglądarka go nie poda (brak zgody, brak GPS, za długo). */
function locate(): Promise<PhonePosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/**
 * Odbicie po skanie plakatu: wejście i przejście zapisują się od razu, a wyjście z tej samej budowy dopiero po
 * „Tak, kończę”. Położenie bierzemy tylko teraz, w chwili skanu.
 */
export function PunchFlow({ code, preview, operationId }: { code: string; preview: PunchPreview; operationId: string }) {
  const [step, setStep] = useState<Step>(preview.action === "wyjscie" ? { kind: "confirm" } : { kind: "working", text: t("punches.locating") });
  const started = useRef(false);

  async function send(confirmExit: boolean) {
    setStep({ kind: "working", text: t("punches.locating") });
    const position = await locate();
    setStep({ kind: "working", text: t("punches.saving") });
    const result = await punch({ posterToken: code, operationId, position, confirmExit });
    if (result.error || !result.outcome) return setStep({ kind: "error", text: result.error ?? t("errors.unexpected") });
    // Ktoś w międzyczasie odbił wejście na tej budowie (np. drugi telefon): pytamy jak przy wyjściu.
    if (result.outcome.action === "potwierdz_wyjscie") return setStep({ kind: "confirm" });
    navigator.vibrate?.(60);
    setStep({ kind: "done", outcome: result.outcome });
  }

  useEffect(() => {
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
      <p className="muted">{t("punches.privacy")}</p>
    </section>
  );
}

function PunchDone({ outcome }: { outcome: Exclude<PunchOutcome, { action: "potwierdz_wyjscie" }> }) {
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
