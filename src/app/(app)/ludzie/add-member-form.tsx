"use client";

import { useActionState, useId, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { MemberRole, RecorderSeats } from "@/registry/registry";
import { addMember } from "./actions";
import { RecorderSeatsNote } from "./recorder-seats";
import { TemporaryPassword } from "@/components/temporary-password";

/** Osoba z kartoteki, która nie ma konta. */
export interface AccountlessPerson {
  personId: string;
  fullName: string;
}

/**
 * Nowe konto: dla nowej osoby (imię i nazwisko) albo dla osoby z kartoteki bez konta, wybranej z listy (`personId`
 * wybiera ją od razu).
 */
export function AddMemberForm({
  roles,
  recorders,
  accountless,
  personId: chosenPersonId = "",
}: {
  roles: MemberRole[];
  recorders: RecorderSeats;
  accountless: AccountlessPerson[];
  personId?: string;
}) {
  const [state, formAction, pending] = useActionState(addMember, {});
  const id = useId();
  // Bez wolnego miejsca w pakiecie wdrożenia da się dodać tylko pracownika, więc od niego zaczynamy.
  const full = recorders.seatsLeft === 0;
  // Pracownik loguje się nazwą użytkownika, a e-mail może pominąć; pozostali logują się e-mailem.
  const [role, setRole] = useState<MemberRole>(full ? "pracownik" : roles[0]);
  const [personId, setPersonId] = useState(chosenPersonId);
  // Osoba, która właśnie dostała konto (albo zniknęła z kartoteki), wypada z listy, a wybór wraca na nową osobę.
  const selected = accountless.some((person) => person.personId === personId) ? personId : "";
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
        {accountless.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-person`}>{t("people.accountFor")}</label>
            <select id={`${id}-person`} name="personId" value={selected} onChange={(event) => setPersonId(event.target.value)}>
              <option value="">{t("people.newPerson")}</option>
              {accountless.map((person) => (
                <option key={person.personId} value={person.personId}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </div>
        )}
        {!selected && (
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-firstName`}>{t("team.firstName")}</label>
              <input id={`${id}-firstName`} name="firstName" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor={`${id}-lastName`}>{t("team.lastName")}</label>
              <input id={`${id}-lastName`} name="lastName" autoComplete="off" required />
            </div>
          </div>
        )}
        <div className="field-row">
          <div className="field">
            <label htmlFor={`${id}-role`}>{t("team.role")}</label>
            <select id={`${id}-role`} name="role" value={role} onChange={(event) => setRole(event.target.value as MemberRole)} required>
              {roles.map((option) => (
                <option key={option} value={option}>
                  {t(`roles.${option}`)}
                </option>
              ))}
            </select>
          </div>
          {worker ? (
            <div className="field">
              <label htmlFor={`${id}-username`}>{t("team.username")}</label>
              <input
                id={`${id}-username`}
                name="username"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={`${id}-username-hint`}
                required
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor={`${id}-email`}>{t("team.email")}</label>
              <input id={`${id}-email`} name="email" type="email" autoComplete="off" required />
            </div>
          )}
        </div>
        {worker && (
          <>
            <p id={`${id}-username-hint`} className="muted">
              {t("team.usernameHint")}
            </p>
            <div className="field">
              <label htmlFor={`${id}-email`}>{t("team.emailOptional")}</label>
              <input id={`${id}-email`} name="email" type="email" autoComplete="off" />
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
            {pending ? t("team.submitting") : t("people.accountSubmit")}
          </button>
        </div>
      </form>
    </div>
  );
}
