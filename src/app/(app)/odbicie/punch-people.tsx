"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { punchCheckText } from "@/lib/punch-text";
import type { PersonPunchOutcome, PunchAction, PunchCheck } from "@/registry/registry";

/** Osoba na liście „Odbij też…”: co zrobi dla niej skan i skąd przejście (nazwa miejsca, jeśli wiadomo). */
export interface PersonOnList {
  person: { id: string; fullName: string };
  action: PunchAction;
  from: string | null;
}

/** Zaznaczona osoba z identyfikatorem operacji, stałym od otwarcia listy: ponowka jej nie zdubluje. */
export type SelectedPerson = PersonOnList & { operationId: string };

/** Co wyszło z odbicia zaznaczonych: komunikaty i wynik sprawdzenia położenia odbijającego albo błąd. */
export type PunchPeopleResult = { lines: string[]; check?: PunchCheck | null } | { error: string };

const ACTION_TEXT = { wejscie: "punches.peopleEntry", wyjscie: "punches.peopleExit" } as const;

function actionText({ action, from }: PersonOnList) {
  if (action !== "przejscie") return t(ACTION_TEXT[action]);
  return from ? t("punches.peopleTransfer", { from }) : t("punches.peopleTransferUnknown");
}

/** Komunikaty po odbiciu zaznaczonych z siecią, w kolejności osób, i wynik sprawdzenia położenia odbijającego. */
export function peopleOutcomeText(selected: PersonOnList[], outcomes: PersonPunchOutcome[]): { lines: string[]; check: PunchCheck | null } {
  const lines = outcomes.map((outcome, index) => {
    const name = selected[index].person.fullName;
    switch (outcome.action) {
      case "wejscie":
        return t("punches.peopleDoneEntry", { name, time: formatTime(outcome.punch.enteredAt) });
      case "wyjscie":
        return t("punches.peopleDoneExit", { name, time: formatTime(outcome.punch.leftAt!) });
      case "przejscie":
        return t("punches.peopleDoneTransfer", { name, from: outcome.left.place.name, place: outcome.punch.place.name, time: formatTime(outcome.punch.enteredAt) });
      case "potwierdz_wyjscie":
        return t("punches.peopleAlreadyHere", { name });
      case "nie_odbity_tu":
        return t("punches.peopleNotHere", { name });
    }
  });
  const saved = outcomes.find((outcome) => outcome.action !== "potwierdz_wyjscie" && outcome.action !== "nie_odbity_tu");
  const check = !saved ? null : saved.action === "wyjscie" ? saved.punch.exit : saved.punch.entry;
  return { lines, check };
}

type Step = { kind: "pick" } | { kind: "working" } | { kind: "done"; lines: string[]; check: PunchCheck | null } | { kind: "error"; text: string };

/**
 * „Odbij też…” po skanie plakatu przez właściciela albo kierownika (ADR 0034): zaznaczone osoby z kartoteki odbija
 * `onPunch` (z siecią albo do kolejki offline). Przy każdej osobie widać, co zrobi skan: zaznaczenie osoby z wyjściem
 * to potwierdzenie jej wyjścia.
 */
export function PunchPeople({
  people,
  offline = false,
  onPunch,
}: {
  people: PersonOnList[];
  offline?: boolean;
  onPunch: (selected: SelectedPerson[]) => Promise<PunchPeopleResult>;
}) {
  const [operationIds] = useState(() => new Map(people.map(({ person }) => [person.id, crypto.randomUUID()])));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [step, setStep] = useState<Step>({ kind: "pick" });

  function toggle(personId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(personId)) next.add(personId);
      return next;
    });
  }

  async function submit() {
    setStep({ kind: "working" });
    const chosen = people.filter(({ person }) => selected.has(person.id)).map((entry) => ({ ...entry, operationId: operationIds.get(entry.person.id)! }));
    const result = await onPunch(chosen);
    if ("error" in result) return setStep({ kind: "error", text: result.error });
    navigator.vibrate?.(60);
    setStep({ kind: "done", lines: result.lines, check: result.check ?? null });
  }

  return (
    <section className="company-card punch-people" aria-labelledby="punch-people-title">
      <h2 id="punch-people-title" className="display section-title">
        {t("punches.peopleTitle")}
      </h2>
      {step.kind === "done" ? (
        <>
          <ul className="punch-people-done" role="status" data-testid="punch-people-done">
            {step.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          {step.check && (
            <p className={step.check.result === "na_budowie" ? "muted" : "text-danger"}>
              {step.check.result === "na_budowie" ? punchCheckText(step.check) : t("punches.flagged", { check: punchCheckText(step.check) })}
            </p>
          )}
          {offline && <p className="muted">{t("punches.queuedPrivacy")}</p>}
          {!offline && (
            <p>
              <Link className="button button-quiet" href="/">
                {t("punches.toBoard")}
              </Link>
            </p>
          )}
        </>
      ) : (
        <div className="stack-form">
          <p className="muted">{t("punches.peopleHint")}</p>
          {offline && <p className="muted">{t("punches.peopleOfflineHint")}</p>}
          <ul className="punch-people-list">
            {people.map((entry) => (
              <li key={entry.person.id}>
                <label className="checkbox">
                  <input type="checkbox" checked={selected.has(entry.person.id)} onChange={() => toggle(entry.person.id)} disabled={step.kind === "working"} />
                  <span>
                    {entry.person.fullName} <span className="muted">· {actionText(entry)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {step.kind === "error" && (
            <p className="form-error" role="alert">
              {step.text}
            </p>
          )}
          <div className="form-actions">
            <button className="button" type="button" disabled={selected.size === 0 || step.kind === "working"} onClick={() => void submit()}>
              {step.kind === "working" ? t("punches.saving") : t("punches.peopleSubmit", { count: selected.size })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
