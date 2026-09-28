"use client";

import { useState } from "react";
import { t } from "@/i18n/t";
import type { ChecklistState } from "./actions";
import { UndoButton } from "./undo-button";

/** Zapisany ruch do pokazania: jego podsumowanie i kogo o nim powiadomiono, albo że czeka w kolejce offline. */
export interface DoneMovement {
  summary: string;
  notified: string[];
  /** Zapisany ruch, który autor może od razu cofnąć; brak przy ruchu z kolejki offline. */
  movementId?: string;
  /** Bez zasięgu: ruch jest w kolejce telefonu i wyśle się sam. */
  queued?: boolean;
}

/**
 * Wynik zatwierdzenia ruchu z checklisty, skanera albo propozycji: co zapisano (z „Cofnij” tuż obok, bo na telefonie
 * „Ostatnie ruchy” są na dole tablicy) albo dlaczego odrzucono, z bieżącym miejscem narzędzi, które ktoś
 * w międzyczasie ruszył. `refreshedHint` mówi, co sprawdzić po odświeżeniu.
 */
export function MovementResult({ done, state, refreshedHint }: { done: DoneMovement | null; state: ChecklistState; refreshedHint: string }) {
  const [undoneId, setUndoneId] = useState<string | null>(null);
  const undone = done?.movementId !== undefined && done.movementId === undoneId;
  return (
    <>
      {done?.queued && (
        <p className="checklist-done checklist-queued" role="status">
          {t("offline.queued", { summary: done.summary })}
        </p>
      )}
      {done && !done.queued && (
        <div className="checklist-done movement-done">
          <p role="status">
            {undone ? t("checklist.undone", { summary: done.summary }) : t("checklist.done", { summary: done.summary })}
            {!undone && done.notified.length > 0 && ` ${t("checklist.notified", { names: done.notified.join(", ") })}`}
          </p>
          {done.movementId && !undone && (
            <UndoButton key={done.movementId} movementId={done.movementId} onUndone={() => setUndoneId(done.movementId!)} />
          )}
        </div>
      )}
      {state.error && (
        <div className="form-error" role="alert">
          <p>{state.error}</p>
          {state.conflicts && (
            <>
              <ul>
                {state.conflicts.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p>{refreshedHint}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
