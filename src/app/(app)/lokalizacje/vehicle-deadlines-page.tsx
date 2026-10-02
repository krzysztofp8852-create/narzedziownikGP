import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { canManageDeadlines, canManageLocations, VEHICLE_DEADLINE_KINDS } from "@/registry/registry";
import { AddDeadlineForm } from "../terminy/deadline-forms";
import { DeadlineItem } from "../terminy/deadline-item";
import { VehicleDataForm } from "./location-forms";
import { LocationShell, loadPlacePage } from "./location-page";

/**
 * Zakładka „Dane i terminy” pojazdu: numer rejestracyjny i VIN oraz terminy pojazdu z dokumentami. Widzi ją każdy
 * w firmie (dokumenty tylko właściciel i kierownik pojazdu); dane i terminy aktywnego pojazdu zmienia właściciel.
 */
export async function VehicleDeadlinesPage({ id }: { id: string }) {
  const { session, location } = await loadPlacePage(id, "pojazd");
  if (!location?.vehicle) notFound();
  const deadlines = await getRegistry().as(session.userId).vehicleDeadlines(id);
  // Nieaktywny (sprzedany) pojazd zostaje tylko do wglądu.
  const writable = !session.company.readOnly && location.open;
  const owner = writable && canManageDeadlines(session);
  const missingKinds = VEHICLE_DEADLINE_KINDS.filter((kind) => kind === "wlasny" || !deadlines.some((deadline) => deadline.kind === kind));
  const { registrationNumber, vin } = location.vehicle;

  return (
    <LocationShell session={session} location={location} tab="terminy">
      <section className="board-section" aria-labelledby="vehicle-data">
        <h2 id="vehicle-data" className="display section-title">
          {t("locationPage.vehicleDataTitle")}
        </h2>
        {registrationNumber || vin ? (
          <dl className="vehicle-data" data-testid="vehicle-data">
            {registrationNumber && (
              <div>
                <dt className="muted">{t("locationPage.registrationNumber")}</dt>
                <dd>
                  <span className="plate">{registrationNumber}</span>
                </dd>
              </div>
            )}
            {vin && (
              <div>
                <dt className="muted">{t("locationPage.vin")}</dt>
                <dd className="vehicle-vin">{vin}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="empty">{t("locationPage.noVehicleData")}</p>
        )}
        {writable && canManageLocations(session) && (
          <details className="panel">
            <summary className="panel-summary">{t("locationPage.vehicleDataEdit")}</summary>
            <VehicleDataForm key={`${registrationNumber}:${vin}`} vehicle={{ id, registrationNumber, vin }} />
          </details>
        )}
      </section>

      <section id="terminy" className="deadlines-section" aria-labelledby="deadlines">
        <div className="section-head">
          <h2 id="deadlines" className="display section-title">
            {t("locationPage.vehicleDeadlinesTitle")}
          </h2>
          <Link href="/terminy">{t("deadlines.companyLink")}</Link>
        </div>
        {deadlines.length === 0 ? (
          <p className="empty">{owner ? t("locationPage.vehicleDeadlinesEmptyOwner") : t("locationPage.vehicleDeadlinesEmpty")}</p>
        ) : (
          <ul className="deadlines">
            {deadlines.map((deadline) => (
              <DeadlineItem key={deadline.id} subject={{ vehicleId: id }} deadline={deadline} session={session} writable={writable} />
            ))}
          </ul>
        )}
        {owner && (
          <>
            <details className="panel">
              <summary className="panel-summary">{t("deadlines.add")}</summary>
              {/* Po dodaniu zostaje mniej rodzajów, a nowy `key` czyści formularz. */}
              <AddDeadlineForm key={`${missingKinds.join()}:${deadlines.length}`} subject={{ vehicleId: id }} kinds={missingKinds} />
            </details>
            <p className="muted">{t("locationPage.vehicleDocumentsHint")}</p>
          </>
        )}
      </section>
    </LocationShell>
  );
}
