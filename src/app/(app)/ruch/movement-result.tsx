import { t } from "@/i18n/t";
import type { ChecklistState } from "./actions";

/** Zapisany ruch do pokazania: jego podsumowanie i kogo o nim powiadomiono, albo że czeka w kolejce offline. */
export interface DoneMovement {
  summary: string;
  notified: string[];
  /** Bez zasięgu: ruch jest w kolejce telefonu i wyśle się sam. */
  queued?: boolean;
}

/**
 * Wynik zatwierdzenia ruchu z checklisty albo skanera: co zapisano albo dlaczego odrzucono, z bieżącym
 * miejscem narzędzi, które ktoś w międzyczasie ruszył. `refreshedHint` mówi, co sprawdzić po odświeżeniu.
 */
export function MovementResult({ done, state, refreshedHint }: { done: DoneMovement | null; state: ChecklistState; refreshedHint: string }) {
  return (
    <>
      {done?.queued && (
        <p className="checklist-done checklist-queued" role="status">
          {t("offline.queued", { summary: done.summary })}
        </p>
      )}
      {done && !done.queued && (
        <p className="checklist-done" role="status">
          {t("checklist.done", { summary: done.summary })}
          {done.notified.length > 0 && ` ${t("checklist.notified", { names: done.notified.join(", ") })}`}
        </p>
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
