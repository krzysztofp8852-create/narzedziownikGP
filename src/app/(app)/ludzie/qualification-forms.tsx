"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useState } from "react";
import { NativePhotoButtons } from "@/components/native-photo-buttons";
import { type MessageKey, t } from "@/i18n/t";
import { withShrunkDocument } from "@/lib/shrink-photo";
import {
  type CustomQualificationKind,
  detailOf,
  hasNote,
  MAX_CYCLE_MONTHS,
  MAX_QUALIFICATION_DETAIL_LENGTH,
  MAX_QUALIFICATION_KIND_NAME_LENGTH,
  MAX_QUALIFICATION_NOTE_LENGTH,
  QUALIFICATION_KINDS,
  type QualificationKind,
} from "@/registry/registry";
import { changeQualification, type QualificationFormState } from "./qualification-actions";

type Command = "add" | "edit" | "delete" | "complete" | "attach" | "deleteDocument" | "addKind";

const SUBMIT_LABELS: Record<Command, MessageKey> = {
  add: "qualifications.submitAdd",
  edit: "qualifications.submitEdit",
  delete: "qualifications.delete",
  complete: "qualifications.submitComplete",
  attach: "qualifications.submitAttach",
  deleteDocument: "qualifications.deleteDocument",
  addKind: "qualifications.submitKind",
};

/**
 * Formularz uprawnienia: polecenie, osoba i uprawnienie w ukrytych polach, błąd i wynik pod polami. `confirm` pyta
 * przed wysłaniem (usunięcie), a `withFile` zmniejsza zdjęcie dokumentu przed wysłaniem.
 */
function QualificationForm({
  command,
  personId,
  qualificationId,
  hidden = {},
  confirm,
  withFile = false,
  quiet = false,
  children,
}: {
  command: Command;
  personId?: string;
  qualificationId?: string;
  hidden?: Record<string, string>;
  /** Pytanie przed wysłaniem. */
  confirm?: string;
  withFile?: boolean;
  /** Mały przycisk bez odstępów, np. „Usuń” przy dokumencie. */
  quiet?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<QualificationFormState, FormData>(changeQualification, {});
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const formData = withFile ? await withShrunkDocument(fields, setPreparing) : fields;
    startTransition(() => formAction(formData));
  }

  const busy = pending || preparing;
  const label = preparing ? t("qualifications.preparing") : pending ? t("qualifications.saving") : t(SUBMIT_LABELS[command]);
  const danger = command === "delete" || command === "deleteDocument";
  return (
    <form onSubmit={onSubmit} className={quiet ? "deadline-inline-form" : "stack-form deadline-form"}>
      <input type="hidden" name="command" value={command} />
      {personId && <input type="hidden" name="personId" value={personId} />}
      {qualificationId && <input type="hidden" name="qualificationId" value={qualificationId} />}
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
              {busy ? label : t("qualifications.deleteYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => setConfirming(false)}>
              {t("qualifications.cancel")}
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

function DueOnField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t("qualifications.dueOnLabel")}</label>
      <input id={id} name="dueOn" type="date" required defaultValue={defaultValue} />
    </div>
  );
}

function CycleField({ id, defaultValue }: { id: string; defaultValue?: number | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t("qualifications.cycleLabel")}</label>
      <input id={id} name="cycleMonths" type="number" inputMode="numeric" min={1} max={MAX_CYCLE_MONTHS} step={1} defaultValue={defaultValue ?? ""} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`}>{t("qualifications.cycleHint")}</small>
    </div>
  );
}

/** Opis rodzaju: urządzenie UDT i kategoria prawa jazdy (wymagane), grupa SEP (opcjonalnie); inne rodzaje go nie mają. */
function DetailField({ id, kind, defaultValue }: { id: string; kind: QualificationKind; defaultValue?: string | null }) {
  const rule = detailOf(kind);
  if (rule === null || (kind !== "udt" && kind !== "prawo_jazdy" && kind !== "sep")) return null;
  return (
    <div className="field">
      <label htmlFor={id}>{t(`qualifications.detailLabel.${kind}`)}</label>
      <input
        id={id}
        name="detail"
        required={rule === "wymagany"}
        maxLength={MAX_QUALIFICATION_DETAIL_LENGTH}
        autoComplete="off"
        placeholder={t(`qualifications.detailPlaceholder.${kind}`)}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}

/** Notatka; badania lekarskie jej nie mają, bo zapisujemy z nich tylko datę. */
function NoteField({ id, kind, defaultValue }: { id: string; kind: QualificationKind; defaultValue?: string | null }) {
  if (!hasNote(kind)) return <p className="muted">{t("qualifications.medicalHint")}</p>;
  return (
    <div className="field">
      <label htmlFor={id}>{t("qualifications.noteLabel")}</label>
      <input id={id} name="note" maxLength={MAX_QUALIFICATION_NOTE_LENGTH} autoComplete="off" placeholder={t("qualifications.notePlaceholder")} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

/** Dokument uprawnienia: w aplikacji zdjęcie też z aparatu albo galerii, a PDF dalej z wyboru pliku. */
function DocumentField({ id, required }: { id: string; required: boolean }) {
  return (
    <div className="field">
      <label htmlFor={`${id}-file`}>{required ? t("qualifications.documentFile") : t("qualifications.documentFileOptional")}</label>
      <NativePhotoButtons inputId={`${id}-file`} name={t("qualifications.defaultFileName")} />
      <input id={`${id}-file`} name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/*" required={required} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`}>{t("qualifications.documentHint")}</small>
    </div>
  );
}

/** Nowe uprawnienie osoby: rodzaj ze stałej listy albo własny rodzaj firmy. Właściciel i kierownik. */
export function AddQualificationForm({ personId, customKinds }: { personId: string; customKinds: CustomQualificationKind[] }) {
  const fixed = QUALIFICATION_KINDS.filter((kind) => kind !== "wlasny");
  const [choice, setChoice] = useState<string>(fixed[0]);
  const kind = (choice.split(":")[0] as QualificationKind) ?? fixed[0];
  return (
    <QualificationForm command="add" personId={personId}>
      <div className="field">
        <label htmlFor="qualification-kind">{t("qualifications.kind")}</label>
        <select id="qualification-kind" name="kind" value={choice} onChange={(event) => setChoice(event.target.value)}>
          <optgroup label={t("qualifications.fixedKinds")}>
            {fixed.map((option) => (
              <option key={option} value={option}>
                {t(`qualifications.kinds.${option}`)}
              </option>
            ))}
          </optgroup>
          {customKinds.length > 0 && (
            <optgroup label={t("qualifications.customKinds")}>
              {customKinds.map((custom) => (
                <option key={custom.id} value={`wlasny:${custom.id}`}>
                  {custom.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      {/* Nowy `key` czyści opis przy zmianie rodzaju. */}
      <DetailField key={kind} id="qualification-detail" kind={kind} />
      <DueOnField id="qualification-due" />
      <CycleField id="qualification-cycle" />
      <NoteField id="qualification-note" kind={kind} />
    </QualificationForm>
  );
}

/** Zmiana daty, cyklu, opisu i notatki uprawnienia; usunięcie tylko u właściciela. */
export function EditQualificationForm({
  personId,
  qualification,
  canDelete,
}: {
  personId: string;
  qualification: { id: string; kind: QualificationKind; dueOn: string; cycleMonths: number | null; note: string | null; detail: string | null };
  canDelete: boolean;
}) {
  const id = `qualification-${qualification.id}`;
  return (
    <>
      <QualificationForm command="edit" personId={personId} qualificationId={qualification.id}>
        <DetailField id={`${id}-detail`} kind={qualification.kind} defaultValue={qualification.detail} />
        <DueOnField id={`${id}-due`} defaultValue={qualification.dueOn} />
        <CycleField id={`${id}-cycle`} defaultValue={qualification.cycleMonths} />
        <NoteField id={`${id}-note`} kind={qualification.kind} defaultValue={qualification.note} />
      </QualificationForm>
      {canDelete && (
        <QualificationForm command="delete" personId={personId} qualificationId={qualification.id} confirm={t("qualifications.deleteConfirm")} />
      )}
    </>
  );
}

/**
 * Odnowienie: dzień szkolenia albo badania (najpóźniej dziś), nowa data ważności (bez cyklu wymagana) i opcjonalnie
 * dokument. Właściciel i kierownik; pole dokumentu tylko u tego, kto może go dołączyć.
 */
export function CompleteQualificationForm({
  personId,
  qualificationId,
  operationId,
  today,
  cycleMonths,
  withDocument,
}: {
  personId: string;
  qualificationId: string;
  operationId: string;
  /** Dziś w Polsce, RRRR-MM-DD. */
  today: string;
  cycleMonths: number | null;
  withDocument: boolean;
}) {
  const id = `complete-${qualificationId}`;
  return (
    <QualificationForm command="complete" personId={personId} qualificationId={qualificationId} hidden={{ operationId }} withFile={withDocument}>
      <div className="field">
        <label htmlFor={`${id}-day`}>{t("qualifications.doneOn")}</label>
        <input id={`${id}-day`} name="doneOn" type="date" required max={today} defaultValue={today} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-next`}>{cycleMonths ? t("qualifications.nextDueOptional") : t("qualifications.nextDueRequired")}</label>
        <input id={`${id}-next`} name="nextDueOn" type="date" min={today} required={!cycleMonths} aria-describedby={`${id}-next-hint`} />
        <small id={`${id}-next-hint`}>{cycleMonths ? t("qualifications.nextDueHint", { months: cycleMonths }) : t("qualifications.nextDueNoCycle")}</small>
      </div>
      {withDocument && <DocumentField id={id} required={false} />}
    </QualificationForm>
  );
}

/** Dokument do uprawnienia: PDF albo zdjęcie. */
export function AttachQualificationDocumentForm({ personId, qualificationId, operationId }: { personId: string; qualificationId: string; operationId: string }) {
  return (
    <QualificationForm command="attach" personId={personId} qualificationId={qualificationId} hidden={{ operationId }} withFile>
      <DocumentField id={`attach-${qualificationId}`} required />
    </QualificationForm>
  );
}

/** Usunięcie dokumentu z potwierdzeniem. Tylko właściciel. */
export function DeleteQualificationDocumentForm({ personId, document }: { personId: string; document: { id: string; fileName: string } }) {
  return (
    <QualificationForm
      command="deleteDocument"
      personId={personId}
      hidden={{ documentId: document.id }}
      confirm={t("qualifications.deleteDocumentConfirm", { name: document.fileName })}
      quiet
    />
  );
}

/** Nowy własny rodzaj uprawnienia firmy. Tylko właściciel. */
export function AddQualificationKindForm() {
  return (
    <QualificationForm command="addKind">
      <div className="field">
        <label htmlFor="qualification-kind-name">{t("qualifications.kindName")}</label>
        <input
          id="qualification-kind-name"
          name="name"
          required
          maxLength={MAX_QUALIFICATION_KIND_NAME_LENGTH}
          autoComplete="off"
          placeholder={t("qualifications.kindPlaceholder")}
        />
      </div>
    </QualificationForm>
  );
}
