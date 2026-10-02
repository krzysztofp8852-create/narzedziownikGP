import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canClarifyPunches } from "@/registry/registry";
import { locationPagePath } from "../lokalizacje/location-page";
import { PunchEntry } from "../lokalizacje/people-on-site";
import { ExplainPunchForm } from "../lokalizacje/punch-forms";

export const metadata: Metadata = { title: t("punches.toClarifyTitle") };

/**
 * Odbicia do wyjaśnienia (poza budową, bez położenia, bez sprawdzenia) dla właściciela i kierownika budowy, z akcją
 * „Wyjaśnione” i opcjonalną notatką.
 */
export default async function PunchesToClarifyPage() {
  const session = await requireSession();
  if (!canClarifyPunches(session)) redirect("/");
  const punches = await getRegistry().as(session.userId).punchesToClarify();

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
        <p className="empty">{t("punches.toClarifyEmpty")}</p>
      ) : (
        <ol className="movements" aria-label={t("punches.toClarifyTitle")}>
          {punches.map((punch) => (
            <PunchEntry key={punch.id} punch={punch} showPlace>
              <p className="movement-meta">
                <Link href={locationPagePath(punch.place.kind, punch.place.id, "/ludzie")}>{t("punches.openPlace", { place: punch.place.name })}</Link>
              </p>
              {/* W trybie tylko do odczytu nie ma czego zapisać; baner mówi dlaczego. */}
              {!session.company.readOnly && <ExplainPunchForm punchId={punch.id} />}
            </PunchEntry>
          ))}
        </ol>
      )}
      <p className="muted">{t("punches.privacy")}</p>
    </>
  );
}
