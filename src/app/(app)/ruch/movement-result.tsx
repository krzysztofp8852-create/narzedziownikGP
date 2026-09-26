import { t } from "@/i18n/t";
import type { ChecklistState } from "./actions";

/** Zapisany ruch do pokazania: jego podsumowanie i kogo o nim powiadomiono. */
export interface DoneMovement {
  summary: string;
  notified: string[];
}

/**
 * Wynik zatwierdzenia ruchu z checklisty albo skanera: co zapisano albo dlaczego odrzucono, z bieżącym
 * miejscem narzędzi, które ktoś w międzyczasie ruszył. `refreshedHint` mówi, co sprawdzić po odświeżeniu.
 */
export function MovementResult({ done, state, refreshedHint }: { done: DoneMovement | null; state: ChecklistState; refreshedHint: string }) {
  return (
    <>
      {done && (
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
