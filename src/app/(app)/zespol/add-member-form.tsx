"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { MemberRole, RecorderSeats } from "@/registry/registry";
import { addMember } from "./actions";
import { RecorderSeatsNote } from "./recorder-seats";
import { TemporaryPassword } from "@/components/temporary-password";

export function AddMemberForm({ roles, recorders }: { roles: MemberRole[]; recorders: RecorderSeats }) {
  const [state, formAction, pending] = useActionState(addMember, {});
  // Bez wolnego miejsca w pakiecie wdrożenia da się dodać tylko pracownika, więc od niego zaczynamy.
  const full = recorders.seatsLeft === 0;
  // Pracownik loguje się nazwą użytkownika, a e-mail może pominąć; pozostali logują się e-mailem.
  const [role, setRole] = useState<MemberRole>(full ? "pracownik" : roles[0]);
  const worker = role === "pracownik";

  return (
    <div className="stack-form">
      {state.added && (
        <TemporaryPassword
          title={
            state.added.username
              ? t("team.addedWorker", { name: state.added.fullName, username: state.added.username })
              : t("team.added", { name: state.added.fullName, email: state.added.email ?? "" })
          }
          password={state.added.temporaryPassword}
        />
      )}
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={state.added?.userId}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="firstName">{t("team.firstName")}</label>
            <input id="firstName" name="firstName" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="lastName">{t("team.lastName")}</label>
            <input id="lastName" name="lastName" autoComplete="off" required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="role">{t("team.role")}</label>
            <select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value as MemberRole)} required>
              {roles.map((option) => (
                <option key={option} value={option}>
                  {t(`roles.${option}`)}
                </option>
              ))}
            </select>
          </div>
          {worker ? (
            <div className="field">
              <label htmlFor="username">{t("team.username")}</label>
              <input
                id="username"
                name="username"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="username-hint"
                required
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="email">{t("team.email")}</label>
              <input id="email" name="email" type="email" autoComplete="off" required />
            </div>
          )}
        </div>
        {worker && (
          <>
            <p id="username-hint" className="muted">
              {t("team.usernameHint")}
            </p>
            <div className="field">
              <label htmlFor="email">{t("team.emailOptional")}</label>
              <input id="email" name="email" type="email" autoComplete="off" />
            </div>
            <p className="muted">{t("team.workerHint")}</p>
          </>
        )}
        <RecorderSeatsNote recorders={recorders} />
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending || (full && !worker)}>
            {pending ? t("team.submitting") : t("team.submitAdd")}
          </button>
        </div>
      </form>
    </div>
  );
}
