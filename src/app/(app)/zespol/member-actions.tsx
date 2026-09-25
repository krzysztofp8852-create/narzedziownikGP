"use client";

import { useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { deactivateMember, type MemberActionState, resetMemberPassword } from "./actions";
import { TemporaryPassword } from "./temporary-password";

/** Przyciski właściciela przy aktywnym kierowniku lub magazynierze. */
export function MemberActions({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [state, setState] = useState<MemberActionState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"reset" | "deactivate" | null>(null);

  function run(kind: "reset" | "deactivate") {
    setRunning(kind);
    startTransition(async () => {
      const result = kind === "reset" ? await resetMemberPassword(memberId) : await deactivateMember(memberId);
      setState(result);
      setConfirming(false);
    });
  }

  return (
    <div className="member-actions">
      {state.temporaryPassword && (
        <TemporaryPassword title={t("team.newPasswordFor", { name: fullName })} password={state.temporaryPassword} />
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {confirming ? (
        <div className="member-confirm">
          <p>{t("team.deactivateConfirm", { name: fullName })}</p>
          <div className="form-actions">
            <button className="button button-danger" type="button" disabled={pending} onClick={() => run("deactivate")}>
              {pending && running === "deactivate" ? t("team.deactivating") : t("team.deactivateYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("team.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button button-quiet" type="button" disabled={pending} onClick={() => run("reset")}>
            {pending && running === "reset" ? t("team.resetting") : t("team.resetPassword")}
          </button>
          <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(true)}>
            {t("team.deactivate")}
          </button>
        </div>
      )}
    </div>
  );
}
