import type { ReactNode } from "react";
import Link from "next/link";
import { SiteManagerLabel } from "@/components/site-manager-label";
import { Money, ToolList } from "@/components/tool-list";
import { VehicleIcon } from "@/components/vehicle-icon";
import { t } from "@/i18n/t";
import { daysLeftText, deadlineName, deadlineWhen } from "@/lib/deadline-text";
import { type SiteManagerCandidate, UPCOMING_DAYS, type UpcomingDeadline, type WhereIsWhat } from "@/registry/registry";
import { changeVehicleManager } from "./actions";
import { locationPagePath } from "./location-page";
import { ChangeManagerForm, DeactivateVehicleForm, VehicleAlarmForm } from "./location-forms";

/** Liczba sztuk i, dla właściciela, suma wartości lokalizacji. */
export function LocationTotals({ count, totalValue }: { count: number; totalValue?: number }) {
  return (
    <span className="location-totals">
      <span className="location-count">{t("board.toolCount", { count })}</span>
      <Money amount={totalValue} className="location-value" />
    </span>
  );
}

/** Kafelek dodawania budowy albo pojazdu. Kierownika jest zawsze z kogo wybrać, bo może nim być sam właściciel. */
export function AddLocationTile({ title, form }: { title: string; form: ReactNode }) {
  return (
    <details className="location location-add">
      <summary className="panel-summary">{title}</summary>
      {form}
    </details>
  );
}

/**
 * Pojazd jak budowa: kierownik i sprzęt, który jest poza bazą. Kto zarządza lokalizacjami (`managers`), zmienia tu
 * kierownika, włącza alarm po progu dni i dezaktywuje pusty pojazd. Z `deadlines` (terminy pojazdu z najbliższych
 * 30 dni i po terminie) karta pokazuje je z odnośnikiem do zakładki „Dane i terminy”.
 */
export function VehicleCard({
  vehicle,
  managers,
  deadlines,
}: {
  vehicle: WhereIsWhat["vehicles"][number];
  managers: SiteManagerCandidate[] | null;
  deadlines?: UpcomingDeadline[];
}) {
  return (
    <section className="location location-site location-vehicle" aria-labelledby={`location-${vehicle.id}`}>
      <div className="location-head">
        <h3 id={`location-${vehicle.id}`} className="display location-name">
          <span className="location-kind">
            <VehicleIcon /> {t("board.vehicleKind")}
          </span>{" "}
          <Link href={locationPagePath("pojazd", vehicle.id)}>{vehicle.name}</Link>
        </h3>
        <LocationTotals count={vehicle.tools.length} totalValue={vehicle.totalValue} />
      </div>
      <div className="location-details">
        {vehicle.registrationNumber && (
          <p>
            <span className="plate">{vehicle.registrationNumber}</span>
          </p>
        )}
        <p>
          <SiteManagerLabel manager={vehicle.manager} />
        </p>
        {!vehicle.alarmEnabled && <p className="muted">{t("board.vehicleAlarmOff")}</p>}
      </div>
      {deadlines && <VehicleDeadlines vehicleId={vehicle.id} deadlines={deadlines} />}
      {vehicle.tools.length === 0 ? <p className="empty">{t("board.vehicleEmpty")}</p> : <ToolList tools={vehicle.tools} />}
      {managers && (
        <>
          <details className="location-more">
            <summary>{t("locations.changeManager")}</summary>
            <ChangeManagerForm
              action={changeVehicleManager.bind(null, vehicle.id)}
              location={vehicle}
              label={t("locations.newVehicleManager", { name: vehicle.name })}
              managers={managers}
            />
          </details>
          <details className="location-more">
            <summary>{t("locations.vehicleAlarm")}</summary>
            <VehicleAlarmForm vehicle={vehicle} />
          </details>
          <details className="location-more">
            <summary>{t("locations.deactivateVehicle")}</summary>
            <DeactivateVehicleForm vehicle={vehicle} empty={vehicle.tools.length === 0} />
          </details>
        </>
      )}
    </section>
  );
}

/** Terminy pojazdu z najbliższych 30 dni i po terminie, z odnośnikiem do zakładki „Dane i terminy”. */
function VehicleDeadlines({ vehicleId, deadlines }: { vehicleId: string; deadlines: UpcomingDeadline[] }) {
  return (
    <div className="location-details" aria-label={t("vehiclesPage.deadlines")} role="group">
      {deadlines.length === 0 ? (
        <p className="muted">{t("vehiclesPage.noDeadlines", { days: UPCOMING_DAYS })}</p>
      ) : (
        <ul className="vehicle-deadline-list">
          {deadlines.map((deadline) => (
            <li key={deadline.id} className={deadline.overdue ? "text-danger" : undefined}>
              {deadlineName(deadline)}: {deadlineWhen(deadline)}, {daysLeftText(deadline.daysLeft)}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href={locationPagePath("pojazd", vehicleId, "/terminy")}>{t("vehiclesPage.deadlinesLink")}</Link>
      </p>
    </div>
  );
}
