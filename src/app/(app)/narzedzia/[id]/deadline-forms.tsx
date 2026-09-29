"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useState } from "react";
import { type MessageKey, t } from "@/i18n/t";
import { withShrunkDocument } from "@/lib/shrink-photo";
import { type DeadlineKind, type DocumentKind, MAX_CYCLE_MONTHS, MAX_DEADLINE_NOTE_LENGTH } from "@/registry/registry";
import { changeDeadline, type DeadlineFormState } from "../deadline-actions";

type Command = "add" | "edit" | "delete" | "complete" | "attach" | "deleteDocument";

const SUBMIT_LABELS: Record<Command, MessageKey> = {
  add: "deadlines.submitAdd",
  edit: "deadlines.submitEdit",
  delete: "deadlines.delete",
  complete: "deadlines.submitComplete",
  attach: "deadlines.submitAttach",
  deleteDocument: "deadlines.deleteDocument",
};

/** Dokumenty, które pokazujemy w wyborze: fakturę dołącza tylko właściciel. */
export interface DocumentChoice {
  kinds: DocumentKind[];
  defaultKind: DocumentKind;
}

/**
 * Formularz terminu: polecenie, narzędzie i termin w ukrytych polach, błąd i wynik pod polami. `confirm` pyta przed
 * wysłaniem (usunięcie), a `withFile` zmniejsza zdjęcie dokumentu przed wysłaniem.
 */
function DeadlineForm({
  command,
  toolId,
  deadlineId,
  hidden = {},
  confirm,
  withFile = false,
  quiet = false,
  children,
}: {
  command: Command;
  toolId: string;
  deadlineId?: string;
  hidden?: Record<string, string>;
  /** Pytanie przed wysłaniem. */
  confirm?: string;
  withFile?: boolean;
  /** Mały przycisk bez odstępów, np. „Usuń” przy dokumencie. */
  quiet?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<DeadlineFormState, FormData>(changeDeadline, {});
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const formData = withFile ? await withShrunkDocument(fields, setPreparing) : fields;
    startTransition(() => formAction(formData));
  }

  const busy = pending || preparing;
  const label = preparing ? t("deadlines.preparing") : pending ? t("deadlines.saving") : t(SUBMIT_LABELS[command]);
  const danger = command === "delete" || command === "deleteDocument";
  return (
    <form onSubmit={onSubmit} className={quiet ? "deadline-inline-form" : "stack-form deadline-form"}>
      <input type="hidden" name="command" value={command} />
      <input type="hidden" name="toolId" value={toolId} />
      {deadlineId && <input type="hidden" name="deadlineId" value={deadlineId} />}
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.done && !state.error && (
        <p className="checklist-done" role="status">
          {state.done}
        </p>
      )}
      {confirm && confirming ? (
        <div className="member-confirm">
          <p>{confirm}</p>
          <div className="form-actions">
            <button className="button button-danger" type="submit" disabled={busy}>
              {busy ? label : t("deadlines.deleteYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => setConfirming(false)}>
              {t("deadlines.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className={quiet ? undefined : "form-actions"}>
          <button
            className={danger ? "button button-quiet button-small" : "button"}
            type={confirm ? "button" : "submit"}
            disabled={busy}
            onClick={confirm ? () => setConfirming(true) : undefined}
          >
            {label}
          </button>
        </div>
      )}
    </form>
  );
}

function DueOnField({ id, kind, defaultValue }: { id: string; kind: DeadlineKind; defaultValue?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{kind === "gwarancja" ? t("deadlines.warrantyUntilLabel") : t("deadlines.dueOnLabel")}</label>
      <input id={id} name="dueOn" type="date" required defaultValue={defaultValue} />
    </div>
  );
}

function CycleField({ id, defaultValue }: { id: string; defaultValue?: number | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t("deadlines.cycleLabel")}</label>
      <input id={id} name="cycleMonths" type="number" inputMode="numeric" min={1} max={MAX_CYCLE_MONTHS} step={1} defaultValue={defaultValue ?? ""} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`}>{t("deadlines.cycleHint")}</small>
    </div>
  );
}

function NoteField({ id, defaultValue }: { id: string; defaultValue?: string | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t("deadlines.noteLabel")}</label>
      <input id={id} name="note" maxLength={MAX_DEADLINE_NOTE_LENGTH} autoComplete="off" placeholder={t("deadlines.notePlaceholder")} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

function DocumentFields({ id, documents, required }: { id: string; documents: DocumentChoice; required: boolean }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-file`}>{required ? t("deadlines.documentFile") : t("deadlines.documentFileOptional")}</label>
        <input id={`${id}-file`} name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/*" required={required} aria-describedby={`${id}-hint`} />
        <small id={`${id}-hint`}>{t("deadlines.documentHint")}</small>
      </div>
      <div className="field">
        <label htmlFor={`${id}-kind`}>{t("deadlines.documentKind")}</label>
        <select id={`${id}-kind`} name="documentKind" defaultValue={documents.defaultKind}>
          {documents.kinds.map((kind) => (
            <option key={kind} value={kind}>
              {t(`deadlines.documentKinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Nowy termin narzędzia: rodzaje, których jeszcze nie ma. Tylko właściciel. */
export function AddDeadlineForm({ toolId, kinds }: { toolId: string; kinds: DeadlineKind[] }) {
  const [kind, setKind] = useState<DeadlineKind>(kinds[0]);
  return (
    <DeadlineForm command="add" toolId={toolId}>
      <div className="field">
        <label htmlFor="deadline-kind">{t("deadlines.kind")}</label>
        <select id="deadline-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as DeadlineKind)}>
          {kinds.map((option) => (
            <option key={option} value={option}>
              {t(`deadlines.kinds.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <DueOnField id="deadline-due" kind={kind} />
      {kind !== "gwarancja" && <CycleField id="deadline-cycle" />}
      <NoteField id="deadline-note" />
    </DeadlineForm>
  );
}

/** Zmiana daty, cyklu i opisu terminu oraz jego usunięcie. Tylko właściciel. */
export function EditDeadlineForm({
  toolId,
  deadline,
}: {
  toolId: string;
  deadline: { id: string; kind: DeadlineKind; dueOn: string | null; cycleMonths: number | null; note: string | null };
}) {
  const id = `deadline-${deadline.id}`;
  return (
    <>
      <DeadlineForm command="edit" toolId={toolId} deadlineId={deadline.id}>
        <DueOnField id={`${id}-due`} kind={deadline.kind} defaultValue={deadline.dueOn ?? undefined} />
        {deadline.kind !== "gwarancja" && <CycleField id={`${id}-cycle`} defaultValue={deadline.cycleMonths} />}
        <NoteField id={`${id}-note`} defaultValue={deadline.note} />
      </DeadlineForm>
      <DeadlineForm command="delete" toolId={toolId} deadlineId={deadline.id} confirm={t("deadlines.deleteConfirm")} />
    </>
  );
}

/**
 * Wykonany przegląd, kalibracja albo badanie UDT: dzień wykonania (najpóźniej dziś), opcjonalnie następny termin
 * i dokument, np. protokół. Właściciel i magazynier.
 */
export function CompleteDeadlineForm({
  toolId,
  deadlineId,
  operationId,
  today,
  nextHint,
  documents,
}: {
  toolId: string;
  deadlineId: string;
  operationId: string;
  /** Dziś w Polsce, RRRR-MM-DD. */
  today: string;
  /** Jak policzy się następny termin, gdy go nie podać. */
  nextHint: string;
  documents: DocumentChoice;
}) {
  const id = `complete-${deadlineId}`;
  return (
    <DeadlineForm command="complete" toolId={toolId} deadlineId={deadlineId} hidden={{ operationId }} withFile>
      <div className="field">
        <label htmlFor={`${id}-day`}>{t("deadlines.doneOn")}</label>
        <input id={`${id}-day`} name="doneOn" type="date" required max={today} defaultValue={today} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-next`}>{t("deadlines.nextDueOn")}</label>
        <input id={`${id}-next`} name="nextDueOn" type="date" min={today} aria-describedby={`${id}-next-hint`} />
        <small id={`${id}-next-hint`}>{nextHint}</small>
      </div>
      <DocumentFields id={id} documents={documents} required={false} />
    </DeadlineForm>
  );
}

/** Dokument do terminu: PDF albo zdjęcie. Właściciel, a magazynier bez faktur. */
export function AttachDocumentForm({ toolId, deadlineId, operationId, documents }: { toolId: string; deadlineId: string; operationId: string; documents: DocumentChoice }) {
  return (
    <DeadlineForm command="attach" toolId={toolId} deadlineId={deadlineId} hidden={{ operationId }} withFile>
      <DocumentFields id={`attach-${deadlineId}`} documents={documents} required />
    </DeadlineForm>
  );
}

/** Usunięcie dokumentu z potwierdzeniem. Tylko właściciel. */
export function DeleteDocumentForm({ toolId, document }: { toolId: string; document: { id: string; fileName: string } }) {
  return (
    <DeadlineForm
      command="deleteDocument"
      toolId={toolId}
      hidden={{ documentId: document.id }}
      confirm={t("deadlines.deleteDocumentConfirm", { name: document.fileName })}
      quiet
    />
  );
}
