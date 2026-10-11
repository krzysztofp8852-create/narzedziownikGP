"use client";

import { useState, useTransition } from "react";
import { t } from "@/i18n/t";

/** Błąd anonimizacji; udana odświeża listę, w której osoba ma już nazwę zastępczą. */
export interface AnonymizeState {
  error?: string;
}

/**
 * Anonimizacja osoby na jej prośbę (Ludzie właściciela i panel super-admina): przycisk, a po nim ostrzeżenie, że tego
 * nie da się cofnąć, i drugi przycisk. `anonymize` to akcja serwera z już wskazaną osobą.
 */
export function AnonymizePersonButton({ fullName, anonymize }: { fullName: string; anonymize: () => Promise<AnonymizeState> }) {
  const [state, setState] = useState<AnonymizeState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setState(await anonymize());
      setConfirming(false);
    });
  }

  return (
    <div className="member-actions">
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {confirming ? (
        <div className="member-confirm">
          <p>{t("anonymize.confirm", { name: fullName })}</p>
          <div className="form-actions">
            <button className="button button-danger" type="button" disabled={pending} onClick={run}>
              {pending ? t("anonymize.running") : t("anonymize.yes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("team.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button button-quiet" type="button" onClick={() => setConfirming(true)}>
            {t("anonymize.button")}
          </button>
        </div>
      )}
    </div>
  );
}
