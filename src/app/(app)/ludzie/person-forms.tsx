"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { MAX_PERSON_NAME_LENGTH, MAX_PERSON_NOTE_LENGTH } from "@/registry/registry";
import { addPerson, deactivatePerson, editPerson, type MemberActionState, type PersonFormState } from "./actions";

/** Pola osoby: imię i nazwisko i notatka. */
function PersonFields({ fullName = "", note = "" }: { fullName?: string; note?: string }) {
  const id = useId();
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-fullName`}>{t("people.fullName")}</label>
        <input id={`${id}-fullName`} name="fullName" defaultValue={fullName} maxLength={MAX_PERSON_NAME_LENGTH} autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>{t("people.noteOptional")}</label>
        <textarea id={`${id}-note`} name="note" defaultValue={note} maxLength={MAX_PERSON_NOTE_LENGTH} rows={2} />
      </div>
    </>
  );
}

function FormError({ error }: { error?: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}

/** Osoba bez konta, np. robotnik bez telefonu. */
export function AddPersonForm() {
  const [state, formAction, pending] = useActionState(addPerson, {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={state.savedAt}>
      <PersonFields />
      <p className="muted">{t("people.addHint")}</p>
      <FormError error={state.error} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("people.adding") : t("people.addSubmit")}
        </button>
      </div>
    </form>
  );
}

/** Zmiana imienia i nazwiska i notatki osoby (z kontem także nazwy konta). */
export function EditPersonForm({ personId, fullName, note }: { personId: string; fullName: string; note: string | null }) {
  const [state, formAction, pending] = useActionState<PersonFormState, FormData>(editPerson.bind(null, personId), {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <PersonFields fullName={fullName} note={note ?? ""} />
      <FormError error={state.error} />
      {state.savedAt && !pending && !state.error && (
        <p className="form-success" role="status">
          {t("people.saved")}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-quiet" type="submit" disabled={pending}>
          {pending ? t("people.saving") : t("people.saveSubmit")}
        </button>
      </div>
    </form>
  );
}

/** Dezaktywacja osoby bez konta, z potwierdzeniem. */
export function DeactivatePersonButton({ personId, fullName }: { personId: string; fullName: string }) {
  const [state, setState] = useState<MemberActionState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setState(await deactivatePerson(personId));
      setConfirming(false);
    });
  }

  return (
    <div className="member-actions">
      <FormError error={state.error} />
      {confirming ? (
        <div className="member-confirm">
          <p>{t("people.deactivateConfirm", { name: fullName })}</p>
          <div className="form-actions">
            <button className="button button-danger" type="button" disabled={pending} onClick={run}>
              {pending ? t("team.deactivating") : t("team.deactivateYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("team.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button button-quiet" type="button" onClick={() => setConfirming(true)}>
            {t("team.deactivate")}
          </button>
        </div>
      )}
    </div>
  );
}
