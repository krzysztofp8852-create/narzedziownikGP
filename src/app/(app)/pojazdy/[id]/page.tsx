import type { Metadata } from "next";
import { EquipmentPage, siteOrVehicleTitle } from "../../lokalizacje/location-page";

export async function generateMetadata(props: PageProps<"/pojazdy/[id]">): Promise<Metadata> {
  return { title: await siteOrVehicleTitle((await props.params).id, "pojazd") };
}

/** Strona pojazdu: sprzęt, który jest tu teraz. */
export default async function VehiclePage(props: PageProps<"/pojazdy/[id]">) {
  return <EquipmentPage id={(await props.params).id} kind="pojazd" />;
}
