"use client";

import { type FormEvent, startTransition, useActionState } from "react";
import { t } from "@/i18n/t";
import type { MemberRole } from "@/registry/registry";
import { addMember } from "./actions";
import { TemporaryPassword } from "./temporary-password";

export function AddMemberForm({ roles }: { roles: MemberRole[] }) {
  const [state, formAction, pending] = useActionState(addMember, {});

  // Po błędzie wpisane dane zostają w formularzu; po dodaniu osoby formularz się czyści.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="stack-form">
      {state.added && (
        <TemporaryPassword
          title={t("team.added", { name: state.added.fullName, email: state.added.email })}
          password={state.added.temporaryPassword}
        />
      )}
      <form onSubmit={submit} className="stack-form" key={state.added?.userId}>
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
            <label htmlFor="email">{t("team.email")}</label>
            <input id="email" name="email" type="email" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="role">{t("team.role")}</label>
            <select id="role" name="role" defaultValue={roles[0]} required>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("team.submitting") : t("team.submitAdd")}
          </button>
        </div>
      </form>
    </div>
  );
}
