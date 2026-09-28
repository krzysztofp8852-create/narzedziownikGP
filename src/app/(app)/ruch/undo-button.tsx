"use client";

import { useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { newOperationId } from "@/lib/operation-id";
import { undoMovement } from "./actions";

/**
 * Cofnięcie własnego ruchu. Identyfikator operacji nadaje serwer przy wyświetleniu listy albo przycisk sam, raz na
 * ruch (ponowne kliknięcie po zerwanym połączeniu nie cofnie dwa razy). `onUndone`: ruch właśnie cofnięto.
 */
export function UndoButton({ movementId, operationId, onUndone }: { movementId: string; operationId?: string; onUndone?: () => void }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [ownOperationId] = useState(() => operationId ?? newOperationId());

  return (
    <span className="undo">
      <button
        className="button button-quiet button-small"
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await undoMovement(movementId, ownOperationId);
            setError(error);
            if (!error) onUndone?.();
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
