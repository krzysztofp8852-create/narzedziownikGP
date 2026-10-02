import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { siteOrVehicleTitle } from "../../../lokalizacje/location-page";
import { VehicleDeadlinesPage } from "../../../lokalizacje/vehicle-deadlines-page";

export async function generateMetadata(props: PageProps<"/pojazdy/[id]/terminy">): Promise<Metadata> {
  const name = await siteOrVehicleTitle((await props.params).id, "pojazd");
  return { title: name ? `${t("locationPage.vehicleTab")}: ${name}` : undefined };
}

/** Zakładka „Dane i terminy” pojazdu: numer rejestracyjny, VIN, OC, przegląd techniczny i pozostałe terminy. */
export default async function VehicleDeadlinesTab(props: PageProps<"/pojazdy/[id]/terminy">) {
  return <VehicleDeadlinesPage id={(await props.params).id} />;
}
