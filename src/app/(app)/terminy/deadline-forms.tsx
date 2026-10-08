"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useRef, useState } from "react";
import { NativePhotoButtons } from "@/components/native-photo-buttons";
import { type MessageKey, t } from "@/i18n/t";
import { withShrunkDocument } from "@/lib/shrink-photo";
import {
  type DeadlineKind,
  type DocumentKind,
  isDateOnlyKind,
  isPolicyKind,
  MAX_CYCLE_MONTHS,
  MAX_DEADLINE_NAME_LENGTH,
  MAX_DEADLINE_NOTE_LENGTH,
} from "@/registry/registry";
import { changeDeadline, type DeadlineFormState } from "./deadline-actions";

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

/** Czego dotyczą terminy formularza: narzędzia z karty albo pojazdu z jego strony. */
export type DeadlineFormSubject = { toolId: string } | { vehicleId: string };

/**
 * Formularz terminu: polecenie, narzędzie albo pojazd i termin w ukrytych polach, błąd i wynik pod polami. `confirm`
 * pyta przed wysłaniem (usunięcie), a `withFile` zmniejsza zdjęcie dokumentu przed wysłaniem. Z `resetOnDone` pola
 * wracają po zapisie do wartości ze strony, a „Zapisano…” zostaje, bo formularz się nie przemontowuje.
 */
function DeadlineForm({
  command,
  subject,
  deadlineId,
  hidden = {},
  confirm,
  withFile = false,
  quiet = false,
  resetOnDone = false,
  values,
  children,
}: {
  command: Command;
  subject: DeadlineFormSubject;
  deadlineId?: string;
  hidden?: Record<string, string>;
  /** Pytanie przed wysłaniem. */
  confirm?: string;
  withFile?: boolean;
  /** Mały przycisk bez odstępów, np. „Usuń” przy dokumencie. */
  quiet?: boolean;
  /** Po zapisie pola wracają do wartości ze strony: puste przy nowym terminie, wykonaniu i dokumencie, zapisane przy zmianie. */
  resetOnDone?: boolean;
  /**
   * Zapisane wartości pól (np. termin i cykl): gdy się zmienią, choćby po wykonaniu terminu innym formularzem, pola
   * wracają do nich. React ustawia `value` pola przy montowaniu, więc nowy `defaultValue` sam go już nie zmienia.
   */
  values?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<DeadlineFormState, FormData>(changeDeadline, {});
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnDone && state.done && !state.error) formRef.current?.reset();
  }, [resetOnDone, state]);

  useEffect(() => {
    if (values !== undefined) formRef.current?.reset();
  }, [values]);

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
    <form ref={formRef} onSubmit={onSubmit} className={quiet ? "deadline-inline-form" : "stack-form deadline-form"}>
      <input type="hidden" name="command" value={command} />
      {"toolId" in subject ? (
        <input type="hidden" name="toolId" value={subject.toolId} />
      ) : (
        <input type="hidden" name="vehicleId" value={subject.vehicleId} />
      )}
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
      <label htmlFor={id}>
        {kind === "gwarancja"
          ? t("deadlines.warrantyUntilLabel")
          : kind === "zwrot"
            ? t("rentals.returnOn")
            : isPolicyKind(kind)
              ? t("deadlines.policyUntilLabel")
              : t("deadlines.dueOnLabel")}
      </label>
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

function NameField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t("deadlines.nameLabel")}</label>
      <input
        id={id}
        name="name"
        required
        maxLength={MAX_DEADLINE_NAME_LENGTH}
        autoComplete="off"
        placeholder={t("deadlines.namePlaceholder")}
        defaultValue={defaultValue}
      />
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

/** Dokument terminu: w aplikacji zdjęcie też z aparatu albo galerii, a PDF dalej z wyboru pliku. */
function DocumentFields({ id, documents, required }: { id: string; documents: DocumentChoice; required: boolean }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-file`}>{required ? t("deadlines.documentFile") : t("deadlines.documentFileOptional")}</label>
        <NativePhotoButtons inputId={`${id}-file`} name={t("deadlines.defaultFileName")} />
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

/** Nowy termin narzędzia albo pojazdu: rodzaje, których jeszcze nie ma (własnych pojazdu może być wiele). Tylko właściciel. */
export function AddDeadlineForm({ subject, kinds }: { subject: DeadlineFormSubject; kinds: DeadlineKind[] }) {
  const [chosen, setKind] = useState<DeadlineKind>(kinds[0]);
  // Dodany rodzaj znika z listy: wtedy wybór wraca na pierwszy wolny.
  const kind = kinds.includes(chosen) ? chosen : kinds[0];
  return (
    <DeadlineForm command="add" subject={subject} resetOnDone>
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
      {kind === "wlasny" && <NameField id="deadline-name" />}
      <DueOnField id="deadline-due" kind={kind} />
      {kind !== "gwarancja" && <CycleField id="deadline-cycle" />}
      <NoteField id="deadline-note" />
    </DeadlineForm>
  );
}

/**
 * Zmiana daty, cyklu, opisu (i nazwy własnego terminu pojazdu) oraz usunięcie terminu. Tylko właściciel; termin zwrotu
 * bez cyklu i usunięcia (przedłużenie).
 */
export function EditDeadlineForm({
  subject,
  deadline,
}: {
  subject: DeadlineFormSubject;
  deadline: { id: string; kind: DeadlineKind; name?: string; dueOn: string | null; cycleMonths: number | null; note: string | null };
}) {
  const id = `deadline-${deadline.id}`;
  return (
    <>
      <DeadlineForm
        command="edit"
        subject={subject}
        deadlineId={deadline.id}
        values={`${deadline.dueOn}:${deadline.cycleMonths}:${deadline.note}:${deadline.name}`}
        resetOnDone
      >
        {deadline.kind === "wlasny" && <NameField id={`${id}-name`} defaultValue={deadline.name} />}
        <DueOnField id={`${id}-due`} kind={deadline.kind} defaultValue={deadline.dueOn ?? undefined} />
        {!isDateOnlyKind(deadline.kind) && <CycleField id={`${id}-cycle`} defaultValue={deadline.cycleMonths} />}
        <NoteField id={`${id}-note`} defaultValue={deadline.note} />
      </DeadlineForm>
      {/* Termin zwrotu znika dopiero ze zwrotem do wypożyczalni. */}
      {deadline.kind !== "zwrot" && <DeadlineForm command="delete" subject={subject} deadlineId={deadline.id} confirm={t("deadlines.deleteConfirm")} />}
    </>
  );
}

/**
 * Wykonany przegląd, kalibracja, badanie UDT albo termin pojazdu: dzień wykonania (najpóźniej dziś), opcjonalnie
 * następny termin i dokument, np. protokół albo nowa polisa. Właściciel, a termin narzędzia też magazynier.
 */
export function CompleteDeadlineForm({
  subject,
  deadlineId,
  operationId,
  today,
  nextHint,
  documents,
}: {
  subject: DeadlineFormSubject;
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
    <DeadlineForm command="complete" subject={subject} deadlineId={deadlineId} hidden={{ operationId }} withFile resetOnDone>
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

/** Dokument do terminu: PDF albo zdjęcie. Właściciel, a magazynier do terminów narzędzi, bez faktur. */
export function AttachDocumentForm({
  subject,
  deadlineId,
  operationId,
  documents,
}: {
  subject: DeadlineFormSubject;
  deadlineId: string;
  operationId: string;
  documents: DocumentChoice;
}) {
  return (
    <DeadlineForm command="attach" subject={subject} deadlineId={deadlineId} hidden={{ operationId }} withFile resetOnDone>
      <DocumentFields id={`attach-${deadlineId}`} documents={documents} required />
    </DeadlineForm>
  );
}

/** Usunięcie dokumentu z potwierdzeniem. Tylko właściciel. */
export function DeleteDocumentForm({ subject, document }: { subject: DeadlineFormSubject; document: { id: string; fileName: string } }) {
  return (
    <DeadlineForm
      command="deleteDocument"
      subject={subject}
      hidden={{ documentId: document.id }}
      confirm={t("deadlines.deleteDocumentConfirm", { name: document.fileName })}
      quiet
    />
  );
}
