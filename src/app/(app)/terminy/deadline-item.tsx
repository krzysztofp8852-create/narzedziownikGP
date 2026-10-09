import { randomUUID } from "node:crypto";
import { FileLink } from "@/components/file-link";
import { formatCalendarDay, formatDateTime, formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { daysLeftText, deadlineName } from "@/lib/deadline-text";
import {
  canAttachDocument,
  canCompleteDeadlines,
  canManageDeadlines,
  type Deadline,
  type DeadlineKind,
  type DeadlineStatus,
  deadlineSubject,
  type DocumentKind,
  documentKindsOf,
  isDateOnlyKind,
  isPolicyKind,
  type Session,
} from "@/registry/registry";
import {
  AttachDocumentForm,
  CompleteDeadlineForm,
  type DeadlineFormSubject,
  DeleteDocumentForm,
  type DocumentChoice,
  EditDeadlineForm,
} from "./deadline-forms";

/** Dokument, który zwykle idzie z terminem danego rodzaju. */
const DEFAULT_DOCUMENT: Record<DeadlineKind, DocumentKind> = {
  przeglad: "protokol",
  kalibracja: "swiadectwo",
  udt: "protokol",
  gwarancja: "karta_gwarancyjna",
  zwrot: "inne",
  przeglad_techniczny: "dowod_rejestracyjny",
  oc: "polisa",
  ac: "polisa",
  tachograf: "protokol",
  wlasny: "inne",
};

const STATUS_TAGS: Record<DeadlineStatus, string> = {
  po_terminie: "tag tag-alarm",
  wkrotce: "tag tag-reported",
  pozniej: "tag",
  bez_terminu: "tag",
  wygasla: "tag",
};

/**
 * Termin na karcie narzędzia albo na stronie pojazdu: stan, cykl, ostatnie wykonanie i dokumenty, z formularzami dla
 * tych, którym wolno: właściciel zmienia i usuwa, wpisuje wykonanie i dołącza dokumenty, a przy terminach narzędzi
 * wykonanie i dokumenty (bez faktur) też magazynier. Termin zwrotu wynajętego zmienia (przedłuża) każdy, kto obsługuje
 * ten wynajem (`handlesRental`). W trybie tylko do odczytu formularzy nie ma.
 */
export function DeadlineItem({
  subject,
  deadline,
  session,
  writable,
  handlesRental = false,
}: {
  subject: DeadlineFormSubject;
  deadline: Deadline;
  session: Session;
  writable: boolean;
  /** Oglądający przedłuża ten wynajem (zmienia termin zwrotu). */
  handlesRental?: boolean;
}) {
  const subjectKind = deadlineSubject(deadline.kind);
  const owner = writable && canManageDeadlines(session);
  const returnDate = deadline.kind === "zwrot";
  const editable = returnDate ? writable && handlesRental : owner;
  const documents: DocumentChoice = {
    kinds: documentKindsOf(subjectKind).filter((kind) => canAttachDocument(session, kind, subjectKind)),
    defaultKind: DEFAULT_DOCUMENT[deadline.kind],
  };
  const completable =
    writable && canCompleteDeadlines(session, subjectKind) && !isDateOnlyKind(deadline.kind) && deadline.dueOn !== null;
  const attachable = writable && documents.kinds.length > 0;
  // Po zapisie strona dostaje nowe identyfikatory operacji; formularz zostaje ten sam, żeby pokazać „Zapisano…”.
  const operationIds = { complete: randomUUID(), attach: randomUUID() };
  const facts = [
    deadline.cycleMonths && t("deadlines.cycle", { months: deadline.cycleMonths }),
    deadline.lastDoneOn && t("deadlines.lastDone", { day: formatCalendarDay(deadline.lastDoneOn) }),
  ].filter(Boolean);

  return (
    <li className={`deadline deadline-${deadline.status}`} data-testid={`deadline-${deadline.kind}`}>
      <div className="deadline-head">
        <strong>{deadlineName(deadline)}</strong>
        <span className={STATUS_TAGS[deadline.status]}>{t(`deadlines.status.${deadline.status}`)}</span>
      </div>
      <p className={deadline.status === "po_terminie" ? "text-danger" : undefined}>{dueText(deadline)}</p>
      {facts.length > 0 && <p className="muted">{facts.join(" ")}</p>}
      {deadline.note && <p className="muted">{deadline.note}</p>}

      {deadline.documents.length > 0 && (
        <ul className="deadline-documents" aria-label={t("deadlines.documents")}>
          {deadline.documents.map((document) => (
            <li key={document.id}>
              <FileLink href={`/dokumenty/${document.id}`}>
                {t(`deadlines.documentKinds.${document.kind}`)}: {document.fileName}
              </FileLink>
              {document.kind === "faktura" && (
                <span className="tag" title={t("deadlines.invoiceHint")}>
                  {t("deadlines.onlyYou")}
                </span>
              )}
              <span className="muted"> {t("deadlines.documentBy", { name: document.uploadedBy, when: formatDateTime(document.uploadedAt) })}</span>
              {owner && <DeleteDocumentForm subject={subject} document={document} />}
            </li>
          ))}
        </ul>
      )}

      {completable && (
        <details className="panel">
          <summary className="panel-summary">{isPolicyKind(deadline.kind) ? t("deadlines.renew") : t("deadlines.complete")}</summary>
          <CompleteDeadlineForm
            subject={subject}
            deadlineId={deadline.id}
            operationId={operationIds.complete}
            today={formatDay(new Date())}
            nextHint={nextHint(deadline)}
            documents={documents}
          />
        </details>
      )}
      {attachable && (
        <details className="panel">
          <summary className="panel-summary">{t("deadlines.attach")}</summary>
          <AttachDocumentForm
            subject={subject}
            deadlineId={deadline.id}
            operationId={operationIds.attach}
            documents={documents}
          />
        </details>
      )}
      {editable && (
        <details className="panel">
          <summary className="panel-summary">{returnDate ? t("deadlines.extendRental") : t("deadlines.edit")}</summary>
          <EditDeadlineForm subject={subject} deadline={deadline} />
        </details>
      )}
    </li>
  );
}

/** Jak policzy się następny termin, gdy go nie podać: od dnia wykonania, przy polisie od końca obecnej, bez cyklu wcale. */
function nextHint(deadline: Deadline): string {
  if (!deadline.cycleMonths) return t("deadlines.nextDueNoCycle");
  if (isPolicyKind(deadline.kind)) return t("deadlines.nextDuePolicyHint", { months: deadline.cycleMonths });
  return t("deadlines.nextDueHint", { months: deadline.cycleMonths });
}

/** „Termin: 13.03.2026 (za 11 dni)”, „Na gwarancji do …”, „Gwarancja skończyła się …” albo „Wykonane, bez następnego terminu.” */
function dueText(deadline: Deadline): string {
  if (deadline.dueOn === null || deadline.daysLeft === null) return t("deadlines.noNextDate");
  const day = formatCalendarDay(deadline.dueOn);
  const left = daysLeftText(deadline.daysLeft);
  if (isPolicyKind(deadline.kind)) return t("deadlines.policyDue", { day, left });
  if (deadline.kind !== "gwarancja") return t("deadlines.dueOn", { day, left });
  return deadline.status === "wygasla" ? t("deadlines.warrantyExpired", { day }) : t("deadlines.warrantyDue", { day, left });
}
