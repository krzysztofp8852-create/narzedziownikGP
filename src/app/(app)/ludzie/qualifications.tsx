import { randomUUID } from "node:crypto";
import Link from "next/link";
import { FileLink } from "@/components/file-link";
import { formatCalendarDay, formatDateTime, formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { daysLeftText } from "@/lib/deadline-text";
import { qualificationName, qualificationWhen } from "@/lib/qualification-text";
import {
  canAttachQualificationDocument,
  canDeleteQualifications,
  canManageQualifications,
  type CustomQualificationKind,
  isMedicalKind,
  type PersonQualifications,
  type Qualification,
  type QualificationStatus,
  type Session,
  UPCOMING_QUALIFICATION_DAYS,
  type UpcomingQualification,
} from "@/registry/registry";
import {
  AddQualificationForm,
  AddQualificationKindForm,
  AttachQualificationDocumentForm,
  CompleteQualificationForm,
  DeleteQualificationDocumentForm,
  EditQualificationForm,
} from "./qualification-forms";

const STATUS_TAGS: Record<QualificationStatus, string> = {
  po_terminie: "tag tag-alarm",
  wkrotce: "tag tag-reported",
  pozniej: "tag",
};

/**
 * Uprawnienia osoby: stan, cykl, ostatnie odnowienie i dokumenty. Właściciel i kierownik dodają, zmieniają i odnawiają
 * je i dołączają dokumenty (kierownik bez orzeczeń z badań lekarskich), a usuwa właściciel. W trybie tylko do odczytu
 * i dla osoby, która odeszła, nowych wpisów nie ma.
 */
export function QualificationList({
  session,
  entry,
  customKinds,
  emptyText = t("qualifications.empty"),
}: {
  session: Session;
  entry: PersonQualifications;
  customKinds: CustomQualificationKind[];
  /** Tekst pustej listy dla kogoś, kto nią nie zarządza; na „Moje uprawnienia” mówi do osoby, a nie o niej. */
  emptyText?: string;
}) {
  const writable = !session.company.readOnly && canManageQualifications(session);
  const { person, qualifications } = entry;
  return (
    <section id="uprawnienia" className="deadlines-section" aria-labelledby="qualifications">
      <h2 id="qualifications" className="display section-title">
        {t("qualifications.title")}
      </h2>
      {!person.active && <p className="muted">{t("qualifications.inactive")}</p>}
      {qualifications.length === 0 ? (
        <p className="empty">{writable && person.active ? t("qualifications.emptyManager") : emptyText}</p>
      ) : (
        <ul className="deadlines">
          {qualifications.map((qualification) => (
            <QualificationItem key={qualification.id} session={session} personId={person.id} qualification={qualification} writable={writable} />
          ))}
        </ul>
      )}
      {writable && person.active && (
        <details className="panel">
          <summary className="panel-summary">{t("qualifications.add")}</summary>
          {/* Po dodaniu lista się wydłuża, a nowy `key` czyści formularz. */}
          <AddQualificationForm key={qualifications.length} personId={person.id} customKinds={customKinds} />
        </details>
      )}
    </section>
  );
}

function QualificationItem({
  session,
  personId,
  qualification,
  writable,
}: {
  session: Session;
  personId: string;
  qualification: Qualification;
  writable: boolean;
}) {
  const owner = writable && canDeleteQualifications(session);
  const attachable = writable && canAttachQualificationDocument(session, qualification.kind);
  // Po zapisie karta dostaje nowe identyfikatory operacji, a nowy `key` czyści formularz.
  const operationIds = { complete: randomUUID(), attach: randomUUID() };
  const facts = [
    qualification.cycleMonths && t("qualifications.cycle", { months: qualification.cycleMonths }),
    qualification.lastDoneOn && t("qualifications.lastDone", { day: formatCalendarDay(qualification.lastDoneOn) }),
  ].filter(Boolean);

  return (
    <li className={`deadline deadline-${qualification.status}`} data-testid={`qualification-${qualification.kind}`}>
      <div className="deadline-head">
        <strong>{qualificationName(qualification)}</strong>
        <span className={STATUS_TAGS[qualification.status]}>{t(`qualifications.status.${qualification.status}`)}</span>
      </div>
      <p className={qualification.status === "po_terminie" ? "text-danger" : undefined}>
        {t("qualifications.dueOn", { day: formatCalendarDay(qualification.dueOn), left: daysLeftText(qualification.daysLeft) })}
      </p>
      {facts.length > 0 && <p className="muted">{facts.join(" ")}</p>}
      {qualification.note && <p className="muted">{qualification.note}</p>}

      {qualification.documents.length > 0 && (
        <ul className="deadline-documents" aria-label={t("qualifications.documents")}>
          {qualification.documents.map((document) => (
            <li key={document.id}>
              <FileLink href={`/dokumenty/uprawnienia/${document.id}`}>
                {document.fileName}
              </FileLink>
              {isMedicalKind(qualification.kind) && <span className="tag">{t("qualifications.onlyOwner")}</span>}
              <span className="muted"> {t("qualifications.documentBy", { name: document.uploadedBy, when: formatDateTime(document.uploadedAt) })}</span>
              {owner && <DeleteQualificationDocumentForm personId={personId} document={document} />}
            </li>
          ))}
        </ul>
      )}

      {writable && (
        <details className="panel">
          <summary className="panel-summary">{t("qualifications.complete")}</summary>
          <CompleteQualificationForm
            key={operationIds.complete}
            personId={personId}
            qualificationId={qualification.id}
            operationId={operationIds.complete}
            today={formatDay(new Date())}
            cycleMonths={qualification.cycleMonths}
            withDocument={attachable}
          />
        </details>
      )}
      {attachable && (
        <details className="panel">
          <summary className="panel-summary">{t("qualifications.attach")}</summary>
          <AttachQualificationDocumentForm key={operationIds.attach} personId={personId} qualificationId={qualification.id} operationId={operationIds.attach} />
        </details>
      )}
      {writable && (
        <details className="panel">
          <summary className="panel-summary">{owner ? t("qualifications.edit") : t("qualifications.editManager")}</summary>
          <EditQualificationForm
            key={`${qualification.dueOn}:${qualification.cycleMonths}:${qualification.note}:${qualification.detail}`}
            personId={personId}
            qualification={qualification}
            canDelete={owner}
          />
        </details>
      )}
    </li>
  );
}

/** Uprawnienia po terminie i kończące się w 30 dni, hurtem: kto, co i do kiedy, z odnośnikiem do osoby. */
export function UpcomingQualifications({ qualifications }: { qualifications: UpcomingQualification[] }) {
  return (
    <section className="company-card" aria-labelledby="upcoming-qualifications">
      <h2 id="upcoming-qualifications" className="display section-title">
        {t("qualifications.upcomingTitle", { days: UPCOMING_QUALIFICATION_DAYS })}
      </h2>
      {qualifications.length === 0 ? (
        <p className="empty">{t("qualifications.upcomingEmpty", { days: UPCOMING_QUALIFICATION_DAYS })}</p>
      ) : (
        <ul className="tool-list" data-testid="upcoming-qualifications">
          {qualifications.map((qualification) => (
            <li key={qualification.id}>
              <Link href={`/ludzie/${qualification.person.id}#uprawnienia`} className={qualification.overdue ? "tool-row tool-row-alarm" : "tool-row"}>
                <span className="tool-row-name">
                  {qualification.person.fullName}
                  <span className="tool-row-sub muted">
                    {qualificationName(qualification)}: {qualificationWhen(qualification)}
                  </span>
                </span>
                <span className="tool-row-meta">
                  <span className="tool-row-days">{daysLeftText(qualification.daysLeft)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Aktywne osoby z liczbą uprawnień, tych po terminie i kończących się wkrótce, z odnośnikiem do karty (kierownik). */
export function PeopleWithQualifications({ people }: { people: PersonQualifications[] }) {
  return (
    <section id="ludzie" className="company-card" aria-labelledby="qualified-people">
      <h2 id="qualified-people" className="display section-title">
        {t("qualifications.peopleTitle")}
      </h2>
      <ul className="tool-list">
        {people.map(({ person, qualifications }) => (
          <li key={person.id}>
            <Link href={`/ludzie/${person.id}`} className="tool-row">
              <span className="tool-row-name">
                {person.fullName}
                <span className="tool-row-sub muted">{qualificationSummary(qualifications)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** „uprawnienia: 3 · po terminie: 1 · wkrótce: 1” albo „bez uprawnień”. */
export function qualificationSummary(qualifications: Qualification[]): string {
  if (qualifications.length === 0) return t("qualifications.summaryNone");
  const overdue = qualifications.filter((qualification) => qualification.status === "po_terminie").length;
  const soon = qualifications.filter((qualification) => qualification.status === "wkrotce").length;
  return [
    t("qualifications.summaryCount", { count: qualifications.length }),
    overdue > 0 && t("qualifications.summaryOverdue", { count: overdue }),
    soon > 0 && t("qualifications.summarySoon", { count: soon }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Własne rodzaje uprawnień firmy i dopisanie nowego. Tylko właściciel, poza trybem tylko do odczytu. */
export function QualificationKinds({ kinds, writable }: { kinds: CustomQualificationKind[]; writable: boolean }) {
  return (
    <details className="panel">
      <summary className="panel-summary">{t("qualifications.kindsTitle")}</summary>
      <p className="muted">{t("qualifications.kindsIntro")}</p>
      {kinds.length === 0 ? <p className="empty">{t("qualifications.kindsEmpty")}</p> : <p>{kinds.map((kind) => kind.name).join(", ")}</p>}
      {writable && <AddQualificationKindForm key={kinds.length} />}
    </details>
  );
}
