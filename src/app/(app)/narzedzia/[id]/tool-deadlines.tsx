import Link from "next/link";
import { t } from "@/i18n/t";
import { ADDABLE_DEADLINE_KINDS, canManageDeadlines, type Session, type ToolCard } from "@/registry/registry";
import { AddDeadlineForm } from "../../terminy/deadline-forms";
import { DeadlineItem } from "../../terminy/deadline-item";

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
              subject={{ toolId: card.id }}
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
          <AddDeadlineForm key={missingKinds.join()} subject={{ toolId: card.id }} kinds={missingKinds} />
        </details>
      )}
    </section>
  );
}

