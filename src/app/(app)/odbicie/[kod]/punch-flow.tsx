"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { locate } from "@/lib/locate";
import { isNetworkError } from "@/lib/offline/client";
import { hasOfflineQueue } from "@/lib/offline/idb";
import { afterOutcome, afterPeoplePreview, afterPeoplePunched, afterPreview, loadPunchState, savePunchState } from "@/lib/offline/punch-state";
import { punchCheckText } from "@/lib/punch-text";
import { normalizePosterCode } from "@/registry/poster-code";
import type { PersonToPunch, Punch, PunchPreview, SavedPunchOutcome } from "@/registry/registry";
import { punch, punchPeople, type PunchPeopleState, type PunchState } from "../actions";
import { queuePeoplePunches, queuePunch } from "../offline-punch";
import { peopleOutcomeText, PunchPeople, type PunchPeopleResult, type SelectedPerson } from "../punch-people";

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
 * Telefon zapamiętuje własny stan, żeby bez sieci zapytać „Kończysz?”. Właściciel i kierownik mają pod spodem listę
 * „Odbij też…” (`people`), od pytania „Kończysz?” albo po własnym odbiciu.
 */
export function PunchFlow({
  userId,
  code,
  preview,
  people,
  operationId,
}: {
  userId: string;
  code: string;
  preview: PunchPreview;
  people: PersonToPunch[];
  operationId: string;
}) {
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

  /** „Odbij też…” z siecią; gdy połączenie zerwie się w trakcie, zaznaczeni trafiają do kolejki pod tymi samymi operacjami. */
  async function sendPeople(selected: SelectedPerson[]): Promise<PunchPeopleResult> {
    const scannedAt = new Date();
    const position = await locate();
    const input = selected.map(({ person, action, operationId: id }) => ({ personId: person.id, operationId: id, confirmExit: action === "wyjscie" }));
    let result: PunchPeopleState;
    try {
      result = await punchPeople({ posterToken: code, position, people: input });
    } catch (error) {
      if (!hasOfflineQueue() || !isNetworkError(error)) return { error: t("errors.unexpected") };
      return { lines: [await queuePeoplePunches({ userId, code: posterCode, scannedAt, position, people: selected })] };
    }
    if (result.error || !result.outcomes) return { error: result.error ?? t("errors.unexpected") };
    const outcomes = result.outcomes;
    const punched = selected.flatMap(({ person }, index) => {
      const outcome = outcomes[index];
      return outcome.action === "potwierdz_wyjscie" || outcome.action === "nie_odbity_tu" ? [] : [{ personId: person.id, action: outcome.action }];
    });
    savePunchState(userId, afterPeoplePunched(loadPunchState(userId), posterCode, punched, new Date()));
    return peopleOutcomeText(selected, outcomes);
  }

  useEffect(() => {
    // Serwer wie najlepiej, gdzie osoba jest odbita; telefon poprawia według niego własny stan.
    let state = afterPreview(loadPunchState(userId), posterCode, preview, new Date());
    if (people.length > 0) state = afterPeoplePreview(state, posterCode, preview.place, people, new Date());
    savePunchState(userId, state);
    if (preview.action === "wyjscie" || started.current) return;
    started.current = true;
    void send(false);
    // Tylko raz, przy otwarciu strony z plakatu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
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
      {people.length > 0 && (step.kind === "confirm" || step.kind === "done" || step.kind === "queued") && (
        <PunchPeople people={people.map(({ person, action, from }) => ({ person, action, from: from?.name ?? null }))} onPunch={sendPeople} />
      )}
    </>
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
