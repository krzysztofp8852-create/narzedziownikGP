import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { punchCheckText } from "@/lib/punch-text";
import { getRegistry } from "@/lib/registry-instance";
import { canClarifyPunches, type PunchConflict } from "@/registry/registry";
import { locationPagePath } from "../lokalizacje/location-page";
import { CorrectPunch, PunchEntry } from "../lokalizacje/people-on-site";
import { ExplainPunchConflictForm, ExplainPunchForm } from "../lokalizacje/punch-forms";

export const metadata: Metadata = { title: t("punches.toClarifyTitle") };

/**
 * Odbicia do wyjaśnienia (poza budową, bez położenia, bez sprawdzenia, bez wyjścia) dla właściciela i kierownika
 * budowy, z poprawką godzin i akcją „Wyjaśnione” z opcjonalną notatką, a pod nimi skany z kolejki offline, które się
 * nie zapisały (konflikty).
 */
export default async function PunchesToClarifyPage() {
  const session = await requireSession();
  if (!canClarifyPunches(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [punches, conflicts] = await Promise.all([registry.punchesToClarify(), registry.punchConflictsToClarify()]);
  // W trybie tylko do odczytu nie ma czego zapisać; baner mówi dlaczego.
  const writable = !session.company.readOnly;

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("locationPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("punches.toClarifyTitle")}</h1>
      <p className="muted">{t(session.role === "wlasciciel" ? "punches.toClarifyIntroOwner" : "punches.toClarifyIntroManager")}</p>
      {punches.length === 0 ? (
        conflicts.length === 0 && <p className="empty">{t("punches.toClarifyEmpty")}</p>
      ) : (
        <ol className="movements" aria-label={t("punches.toClarifyTitle")}>
          {punches.map((punch) => (
            <PunchEntry key={punch.id} punch={punch} showPlace>
              <p className="movement-meta">
                <Link href={locationPagePath(punch.place.kind, punch.place.id, "/ludzie")}>{t("punches.openPlace", { place: punch.place.name })}</Link>
              </p>
              {writable && punch.correctable && <CorrectPunch punch={punch} />}
              {writable && <ExplainPunchForm punchId={punch.id} />}
            </PunchEntry>
          ))}
        </ol>
      )}
      {conflicts.length > 0 && (
        <section className="board-section" aria-labelledby="punch-conflicts">
          <h2 id="punch-conflicts" className="display section-title">
            {t("punches.conflictsTitle")}
          </h2>
          <p className="muted">{t("punches.conflictsIntro")}</p>
          <ol className="movements" aria-label={t("punches.conflictsTitle")}>
            {conflicts.map((conflict) => (
              <PunchConflictEntry key={conflict.id} conflict={conflict}>
                {writable && <ExplainPunchConflictForm conflictId={conflict.id} />}
              </PunchConflictEntry>
            ))}
          </ol>
        </section>
      )}
      <p className="muted">{t("punches.privacy")}</p>
    </>
  );
}

/** Skan z kolejki offline, który się nie zapisał: kto, gdzie, kiedy skanował, co chciał zapisać i dlaczego się nie dało. */
function PunchConflictEntry({ conflict, children }: { conflict: PunchConflict; children: ReactNode }) {
  return (
    <li className="movement" data-testid="punch-conflict">
      <div className="movement-head">
        <span>{conflict.person.fullName}</span>
        <span className="muted">{conflict.place?.name ?? t("punches.conflictUnknownPlace")}</span>
        <span className="tag tag-alarm">{t("punches.toClarifyTag")}</span>
      </div>
      <p className="muted movement-meta">
        {t("punches.conflictScan", {
          scanned: formatDateTime(conflict.scannedAt),
          action: t(conflict.confirmExit ? "punches.conflictExit" : "punches.conflictEntry"),
          received: formatDateTime(conflict.receivedAt),
        })}
      </p>
      <p className="movement-meta">
        {t(`punches.conflictReasons.${conflict.reason}`)}
        {conflict.check && ` · ${punchCheckText(conflict.check)}`}
      </p>
      {conflict.punchedByName && <p className="muted movement-meta">{t("punches.punchedBy", { name: conflict.punchedByName })}</p>}
      {conflict.place && (
        <p className="movement-meta">
          <Link href={locationPagePath(conflict.place.kind, conflict.place.id, "/ludzie")}>{t("punches.openPlace", { place: conflict.place.name })}</Link>
        </p>
      )}
      {children}
    </li>
  );
}
