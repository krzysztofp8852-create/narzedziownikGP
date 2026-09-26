"use client";

import { useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { undoMovement } from "./actions";

/** Cofnięcie własnego ruchu. Identyfikator operacji nadaje serwer przy wyświetleniu listy. */
export function UndoButton({ movementId, operationId }: { movementId: string; operationId: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <span className="undo">
      <button
        className="button button-quiet button-small"
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError((await undoMovement(movementId, operationId)).error);
          })
        }
      >
        {pending ? t("board.undoing") : t("board.undo")}
      </button>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
