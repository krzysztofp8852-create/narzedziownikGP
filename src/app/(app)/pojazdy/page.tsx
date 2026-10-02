import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageLocations, UPCOMING_DAYS, type UpcomingDeadline } from "@/registry/registry";
import { AddLocationTile, VehicleCard } from "../lokalizacje/location-cards";
import { AddVehicleForm } from "../lokalizacje/location-forms";
import { locationPagePath } from "../lokalizacje/location-page";

export const metadata: Metadata = { title: t("vehiclesPage.title") };

/**
 * Flota firmy dla każdej roli: aktywne pojazdy jak na tablicy (kierownik, sprzęt na pokładzie) z numerem rejestracyjnym
 * i terminami pojazdu z najbliższych 30 dni i po terminie, a pod nimi nieaktywne do wglądu. Dodaje, zmienia i dezaktywuje
 * pojazdy ten, kto może to zrobić na tablicy.
 */
export default async function VehiclesPage() {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const [board, places, deadlines, managers] = await Promise.all([
    registry.whereIsWhat(),
    registry.locations(),
    registry.upcomingDeadlines(),
    canManageLocations(session) ? registry.siteManagerCandidates() : null,
  ]);
  const { vehicles } = board;
  const inactive = places.vehicles.filter((vehicle) => !vehicle.active);
  const deadlinesOf = (vehicleId: string): UpcomingDeadline[] =>
    deadlines.filter((deadline) => deadline.tool === null && deadline.location.id === vehicleId);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("vehiclesPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("vehiclesPage.title")}</h1>
      <p className="muted">{t("vehiclesPage.intro", { days: UPCOMING_DAYS })}</p>
      {vehicles.length === 0 && <p className="empty">{managers ? t("vehiclesPage.emptyOwner") : t("vehiclesPage.empty")}</p>}
      {(vehicles.length > 0 || managers) && (
        <div className="site-grid">
          {vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} managers={managers} deadlines={deadlinesOf(vehicle.id)} />
          ))}
          {managers && <AddLocationTile title={t("board.addVehicle")} form={<AddVehicleForm managers={managers} />} />}
        </div>
      )}
      {inactive.length > 0 && (
        <section className="board-section" aria-labelledby="inactive-vehicles">
          <h2 id="inactive-vehicles" className="display section-title">
            {t("vehiclesPage.inactiveTitle")}
          </h2>
          <ul className="tool-list">
            {inactive.map((vehicle) => (
              <li key={vehicle.id}>
                <Link href={locationPagePath("pojazd", vehicle.id)} className="tool-row">
                  {vehicle.registrationNumber && <span className="plate">{vehicle.registrationNumber}</span>}
                  <span className="tool-row-name">{vehicle.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
