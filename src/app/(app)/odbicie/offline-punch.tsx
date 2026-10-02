"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { locate } from "@/lib/locate";
import { enqueuePunch } from "@/lib/offline/client";
import {
  afterPeoplePunched,
  afterQueuedPunch,
  loadPunchState,
  offlinePeopleToPunch,
  offlinePlaceName,
  offlinePunchAction,
  savePunchState,
} from "@/lib/offline/punch-state";
import { formatPosterCode } from "@/posters/url";
import type { PhonePosition, PunchAction } from "@/registry/registry";
import { PunchPeople, type SelectedPerson } from "./punch-people";

const QUEUED_TEXT = { wejscie: "punches.queuedEntry", wyjscie: "punches.queuedExit", przejscie: "punches.queuedTransfer" } as const;

/**
 * Skan plakatu bez sieci trafia do kolejki offline (ADR 0033) z chwilą skanu i położeniem, a telefon zapamiętuje, gdzie
 * osoba jest teraz odbita. Zwraca komunikat dla osoby.
 */
export async function queuePunch(scan: {
  userId: string;
  code: string;
  operationId: string;
  action: PunchAction;
  scannedAt: Date;
  position: PhonePosition | null;
}): Promise<string> {
  const state = loadPunchState(scan.userId);
  const place = offlinePlaceName(state, scan.code) ?? t("punches.unknownPlace", { code: formatPosterCode(scan.code) });
  await enqueuePunch({
    operationId: scan.operationId,
    userId: scan.userId,
    posterCode: scan.code,
    position: scan.position,
    action: scan.action,
    scannedAt: scan.scannedAt.toISOString(),
    summary: place,
  });
  savePunchState(scan.userId, afterQueuedPunch(state, scan.code, scan.action, scan.scannedAt));
  navigator.vibrate?.(60);
  return t(QUEUED_TEXT[scan.action], { place, time: formatTime(scan.scannedAt) });
}

/**
 * „Odbij też…” bez sieci: każda zaznaczona osoba trafia do kolejki offline jako osobne odbicie z tą samą chwilą skanu
 * i położeniem odbijającego, a telefon zapamiętuje, gdzie jest teraz odbita. Zwraca komunikat dla odbijającego.
 */
export async function queuePeoplePunches(scan: {
  userId: string;
  code: string;
  scannedAt: Date;
  position: PhonePosition | null;
  people: SelectedPerson[];
}): Promise<string> {
  const state = loadPunchState(scan.userId);
  const place = offlinePlaceName(state, scan.code) ?? t("punches.unknownPlace", { code: formatPosterCode(scan.code) });
  for (const { person, action, operationId } of scan.people) {
    await enqueuePunch({
      operationId,
      userId: scan.userId,
      posterCode: scan.code,
      position: scan.position,
      action,
      scannedAt: scan.scannedAt.toISOString(),
      summary: place,
      person: { id: person.id, name: person.fullName },
    });
  }
  const punched = scan.people.map(({ person, action }) => ({ personId: person.id, action }));
  savePunchState(scan.userId, afterPeoplePunched(state, scan.code, punched, scan.scannedAt));
  return t("punches.peopleQueued", { count: scan.people.length, place, time: formatTime(scan.scannedAt) });
}

type Step = { kind: "confirm"; place: string } | { kind: "working" } | { kind: "done"; text: string } | { kind: "error" };

/**
 * Odbicie po skanie w skanerze programu bez sieci: telefon z poprzednich odbić wie, czy osoba jest odbita na tej
 * budowie, i wtedy pyta „Kończysz?”. Wejście i przejście zapisują się w kolejce od razu. Właściciel i kierownik
 * (`punchesOthers`) dostają też listę „Odbij też…” z ostatniego odbicia z siecią.
 */
export function OfflinePunch({ userId, code, punchesOthers, onClose }: { userId: string; code: string; punchesOthers: boolean; onClose: () => void }) {
  const [scan] = useState(() => {
    const state = loadPunchState(userId);
    const scannedAt = new Date();
    return {
      scannedAt,
      operationId: crypto.randomUUID(),
      action: offlinePunchAction(state, code, scannedAt),
      place: offlinePlaceName(state, code),
      people: punchesOthers ? offlinePeopleToPunch(state, code, scannedAt) : [],
    };
  });
  const [step, setStep] = useState<Step>(
    scan.action === "wyjscie" ? { kind: "confirm", place: scan.place ?? formatPosterCode(code) } : { kind: "working" },
  );
  const started = useRef(false);

  async function save() {
    setStep({ kind: "working" });
    try {
      const position = await locate();
      setStep({ kind: "done", text: await queuePunch({ userId, code, ...scan, position }) });
    } catch {
      setStep({ kind: "error" });
    }
  }

  async function queuePeople(people: SelectedPerson[]) {
    try {
      const position = await locate();
      return { lines: [await queuePeoplePunches({ userId, code, scannedAt: scan.scannedAt, position, people })] };
    } catch {
      return { error: t("errors.unexpected") };
    }
  }

  useEffect(() => {
    if (scan.action === "wyjscie" || started.current) return;
    started.current = true;
    void save();
    // Tylko raz, zaraz po skanie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="punch-flow stack-form">
      {step.kind === "confirm" && (
        <>
          <p>
            <strong>{step.place}</strong>
          </p>
          <p>{t("punches.confirmExit")}</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={() => void save()}>
              {t("punches.confirmExitYes")}
            </button>
            <button className="button button-quiet" type="button" onClick={onClose}>
              {t("punches.confirmExitNo")}
            </button>
          </div>
        </>
      )}
      {step.kind === "working" && <p aria-live="polite">{t("punches.locating")}</p>}
      {step.kind === "error" && (
        <p className="form-error" role="alert">
          {t("errors.unexpected")}
        </p>
      )}
      {step.kind === "done" && (
        <>
          <p role="status" data-testid="punch-queued">
            {step.text}
          </p>
          <p className="muted">{t("punches.queuedPrivacy")}</p>
        </>
      )}
      {scan.people.length > 0 && (step.kind === "confirm" || step.kind === "done") && <PunchPeople people={scan.people} offline onPunch={queuePeople} />}
      {step.kind === "done" && (
        <p>
          <button className="button button-quiet" type="button" onClick={onClose}>
            {t("punches.toBoard")}
          </button>
        </p>
      )}
    </div>
  );
}
