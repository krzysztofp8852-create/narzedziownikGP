import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/i18n/t";
import { formatPosterCode } from "@/posters/url";
import { distanceText, punchChecksText, punchedByText, punchTimeText } from "@/lib/punch-text";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import { canPrintPoster, canSetPunchRadius, type Poster, type Punch } from "@/registry/registry";
import { LocationShell, loadPlacePage, type PlacePageKind } from "./location-page";
import { PunchRadiusForm, RenewPosterForm } from "./punch-forms";

/**
 * Odbicie na liście: kto, kiedy, wyniki sprawdzenia położenia, kto odbijał za osobę, „do wyjaśnienia” albo
 * wyjaśnienie; `children` pod spodem.
 */
export function PunchEntry({ punch, showPlace = false, children }: { punch: Punch; showPlace?: boolean; children?: ReactNode }) {
  const punchedBy = punchedByText(punch);
  return (
    <li className="movement" data-testid="punch">
      <div className="movement-head">
        <span>{punch.person.fullName}</span>
        {showPlace && <span className="muted">{punch.place.name}</span>}
        {punch.toClarify && <span className="tag tag-alarm">{t("punches.toClarifyTag")}</span>}
      </div>
      <p className="muted movement-meta">{punchTimeText(punch)}</p>
      <p className="movement-meta">{punchChecksText(punch)}</p>
      {punchedBy && (
        <p className="muted movement-meta" data-testid="punch-punched-by">
          {punchedBy}
        </p>
      )}
      {punch.explained && (
        <p className="muted movement-meta">
          {punch.explained.note
            ? t("punches.explainedWithNote", { name: punch.explained.byName, note: punch.explained.note })
            : t("punches.explainedBy", { name: punch.explained.byName })}
        </p>
      )}
      {children}
    </li>
  );
}

/**
 * Zakładka „Ludzie na budowie” (i „Ludzie na bazie”): kto jest odbity teraz i historia odbić, które aktor widzi.
 * Właściciel i kierownik budowy mają tu też plakat do wydruku i „Nowy kod”, a właściciel promień odbicia.
 */
export async function PeopleOnSitePage({ id, kind }: { id: string | null; kind: PlacePageKind }) {
  const { session, location } = await loadPlacePage(id, kind);
  if (!location || location.kind === "pojazd") notFound();
  const registry = getRegistry().as(session.userId);
  const people = await registry.peopleOnSite(location.id);
  const printable = location.open && canPrintPoster(session, { kind: location.kind, managerId: location.manager?.id ?? null });
  const poster = printable ? await posterOrMissingAddress(() => registry.poster(location.id)) : null;
  // W trybie tylko do odczytu nie ma czego zapisać; baner mówi dlaczego. Plakat da się pobrać.
  const writable = !session.company.readOnly;
  const here = location.kind === "baza" ? t("punches.presentBase") : t("punches.presentSite");

  return (
    <LocationShell session={session} location={location} tab="ludzie">
      <section className="board-section" aria-labelledby="punches-present">
        <h2 id="punches-present" className="display section-title">
          {here} ({people.present.length})
        </h2>
        {people.present.length === 0 ? (
          <p className="empty">{t("punches.presentEmpty")}</p>
        ) : (
          <ol className="movements" aria-label={here}>
            {people.present.map((punch) => (
              <PunchEntry key={punch.id} punch={punch} />
            ))}
          </ol>
        )}
      </section>

      {printable && (
        <section className="company-card" aria-labelledby="poster-title">
          <h2 id="poster-title" className="display section-title">
            {location.kind === "baza" ? t("punches.posterBaseTitle") : t("punches.posterTitle")}
          </h2>
          <p>{t("punches.posterHint")}</p>
          {poster === "brak_adresu" ? (
            <p className="muted">{t("errors.poster_no_address")}</p>
          ) : (
            poster && (
              <>
                <p>
                  {/* Zwykły odnośnik: plik ma się pobrać, a nie otworzyć jako strona. */}
                  <a className="button" href={`/plakat/${location.id}`} download>
                    {t("punches.posterDownload")}
                  </a>
                </p>
                <p className="muted">{t("punches.posterCode", { code: formatPosterCode(poster.code) })}</p>
                {writable && <RenewPosterForm locationId={location.id} />}
              </>
            )
          )}
          <p>
            {t("punches.radius", { radius: distanceText(people.radiusM) })}
            {!people.positioned && <span className="muted"> · {t("punches.notPositioned")}</span>}
          </p>
          {writable && canSetPunchRadius(session) && <PunchRadiusForm locationId={location.id} radiusM={people.radiusM} />}
        </section>
      )}

      <section className="board-section" aria-labelledby="punches-history">
        <h2 id="punches-history" className="display section-title">
          {t("punches.historyTitle")}
        </h2>
        {people.history.length === 0 ? (
          <p className="empty">{t("punches.historyEmpty")}</p>
        ) : (
          <ol className="movements" aria-label={t("punches.historyTitle")}>
            {people.history.map((punch) => (
              <PunchEntry key={punch.id} punch={punch} />
            ))}
          </ol>
        )}
        <p className="muted">{t("punches.privacy")}</p>
      </section>
    </LocationShell>
  );
}

/** Plakat albo „brak adresu” przy bazie bez adresu. */
async function posterOrMissingAddress(load: () => Promise<Poster>): Promise<Poster | "brak_adresu"> {
  try {
    return await load();
  } catch (error) {
    if (isRegistryError(error) && error.code === "poster_no_address") return "brak_adresu";
    throw error;
  }
}
