import { randomUUID } from "node:crypto";
import Link from "next/link";
import { formatCalendarDay, formatDateTime, formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { daysLeftText, deadlineKindName } from "@/lib/deadline-text";
import {
  canAttachDocument,
  canCompleteDeadlines,
  canManageDeadlines,
  ADDABLE_DEADLINE_KINDS,
  type DeadlineKind,
  type DeadlineStatus,
  DOCUMENT_KINDS,
  type DocumentKind,
  isDateOnlyKind,
  type Session,
  type ToolCard,
  type ToolDeadline,
} from "@/registry/registry";
import { AddDeadlineForm, AttachDocumentForm, CompleteDeadlineForm, DeleteDocumentForm, type DocumentChoice, EditDeadlineForm } from "./deadline-forms";

/** Dokument, który zwykle idzie z terminem danego rodzaju. */
const DEFAULT_DOCUMENT: Record<DeadlineKind, DocumentKind> = {
  przeglad: "protokol",
  kalibracja: "swiadectwo",
  udt: "protokol",
  gwarancja: "karta_gwarancyjna",
  zwrot: "inne",
};

const STATUS_TAGS: Record<DeadlineStatus, string> = {
  po_terminie: "tag tag-alarm",
  wkrotce: "tag tag-reported",
  pozniej: "tag",
  bez_terminu: "tag",
  wygasla: "tag",
};

/**
 * Terminy na karcie narzędzia: stan, cykl, ostatnie wykonanie i dokumenty każdego terminu. Właściciel dodaje, zmienia
 * i usuwa terminy, właściciel i magazynier wpisują wykonanie i dołączają dokumenty. Termin zwrotu wynajętego zmienia
 * (przedłuża) każdy, kto obsługuje ten wynajem, a nie usuwa go nikt. W trybie tylko do odczytu formularzy nie ma.
 */
export function ToolDeadlines({ session, card }: { session: Session; card: ToolCard }) {
  const writable = !session.company.readOnly;
  const owner = writable && canManageDeadlines(session);
  const missingKinds = ADDABLE_DEADLINE_KINDS.filter((kind) => !card.deadlines.some((deadline) => deadline.kind === kind));
  return (
    <section id="terminy" className="deadlines-section" aria-labelledby="deadlines">
      <div className="section-head">
        <h2 id="deadlines" className="display section-title">
          {t("deadlines.title")}
        </h2>
        <Link href="/terminy">{t("deadlines.companyLink")}</Link>
      </div>
      {card.deadlines.length === 0 ? (
        <p className="empty">{owner ? t("deadlines.emptyOwner") : t("deadlines.empty")}</p>
      ) : (
        <ul className="deadlines">
          {card.deadlines.map((deadline) => (
            <DeadlineItem
              key={deadline.id}
              toolId={card.id}
              deadline={deadline}
              session={session}
              writable={writable}
              handlesRental={card.state === "w_obiegu" && card.rental?.handledByViewer === true}
            />
          ))}
        </ul>
      )}
      {owner && missingKinds.length > 0 && (
        <details className="panel">
          <summary className="panel-summary">{t("deadlines.add")}</summary>
          {/* Po dodaniu zostaje mniej rodzajów, a nowy `key` czyści formularz. */}
          <AddDeadlineForm key={missingKinds.join()} toolId={card.id} kinds={missingKinds} />
        </details>
      )}
    </section>
  );
}

function DeadlineItem({
  toolId,
  deadline,
  session,
  writable,
  handlesRental,
}: {
  toolId: string;
  deadline: ToolDeadline;
  session: Session;
  writable: boolean;
  /** Oglądający przedłuża ten wynajem (zmienia termin zwrotu). */
  handlesRental: boolean;
}) {
  const owner = writable && canManageDeadlines(session);
  const returnDate = deadline.kind === "zwrot";
  const editable = returnDate ? writable && handlesRental : owner;
  const documents: DocumentChoice = {
    kinds: DOCUMENT_KINDS.filter((kind) => canAttachDocument(session, kind)),
    defaultKind: DEFAULT_DOCUMENT[deadline.kind],
  };
  const completable = writable && canCompleteDeadlines(session) && !isDateOnlyKind(deadline.kind) && deadline.dueOn !== null;
  const attachable = writable && documents.kinds.length > 0;
  // Po zapisie karta dostaje nowe identyfikatory operacji, a nowy `key` czyści formularz.
  const operationIds = { complete: randomUUID(), attach: randomUUID() };
  const facts = [
    deadline.cycleMonths && t("deadlines.cycle", { months: deadline.cycleMonths }),
    deadline.lastDoneOn && t("deadlines.lastDone", { day: formatCalendarDay(deadline.lastDoneOn) }),
  ].filter(Boolean);

  return (
    <li className={`deadline deadline-${deadline.status}`} data-testid={`deadline-${deadline.kind}`}>
      <div className="deadline-head">
        <strong>{deadlineKindName(deadline.kind)}</strong>
        <span className={STATUS_TAGS[deadline.status]}>{t(`deadlines.status.${deadline.status}`)}</span>
      </div>
      <p className={deadline.status === "po_terminie" ? "text-danger" : undefined}>{dueText(deadline)}</p>
      {facts.length > 0 && <p className="muted">{facts.join(" ")}</p>}
      {deadline.note && <p className="muted">{deadline.note}</p>}

      {deadline.documents.length > 0 && (
        <ul className="deadline-documents" aria-label={t("deadlines.documents")}>
          {deadline.documents.map((document) => (
            <li key={document.id}>
              <a href={`/dokumenty/${document.id}`} target="_blank" rel="noopener">
                {t(`deadlines.documentKinds.${document.kind}`)}: {document.fileName}
              </a>
              {document.kind === "faktura" && (
                <span className="tag" title={t("deadlines.invoiceHint")}>
                  {t("deadlines.onlyYou")}
                </span>
              )}
              <span className="muted"> {t("deadlines.documentBy", { name: document.uploadedBy, when: formatDateTime(document.uploadedAt) })}</span>
              {owner && <DeleteDocumentForm toolId={toolId} document={document} />}
            </li>
          ))}
        </ul>
      )}

      {completable && (
        <details className="panel">
          <summary className="panel-summary">{t("deadlines.complete")}</summary>
          <CompleteDeadlineForm
            key={operationIds.complete}
            toolId={toolId}
            deadlineId={deadline.id}
            operationId={operationIds.complete}
            today={formatDay(new Date())}
            nextHint={deadline.cycleMonths ? t("deadlines.nextDueHint", { months: deadline.cycleMonths }) : t("deadlines.nextDueNoCycle")}
            documents={documents}
          />
        </details>
      )}
      {attachable && (
        <details className="panel">
          <summary className="panel-summary">{t("deadlines.attach")}</summary>
          <AttachDocumentForm key={operationIds.attach} toolId={toolId} deadlineId={deadline.id} operationId={operationIds.attach} documents={documents} />
        </details>
      )}
      {editable && (
        <details className="panel">
          <summary className="panel-summary">{returnDate ? t("deadlines.extendRental") : t("deadlines.edit")}</summary>
          <EditDeadlineForm key={`${deadline.dueOn}:${deadline.cycleMonths}:${deadline.note}`} toolId={toolId} deadline={deadline} />
        </details>
      )}
    </li>
  );
}

/** „Termin: 13.03.2026 (za 11 dni)”, „Na gwarancji do …”, „Gwarancja skończyła się …” albo „Wykonane, bez następnego terminu.” */
function dueText(deadline: ToolDeadline): string {
  if (deadline.dueOn === null || deadline.daysLeft === null) return t("deadlines.noNextDate");
  const day = formatCalendarDay(deadline.dueOn);
  const left = daysLeftText(deadline.daysLeft);
  if (deadline.kind !== "gwarancja") return t("deadlines.dueOn", { day, left });
  return deadline.status === "wygasla" ? t("deadlines.warrantyExpired", { day }) : t("deadlines.warrantyDue", { day, left });
}
