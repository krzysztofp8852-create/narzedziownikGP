import type { Metadata } from "next";
import { EquipmentPage, siteOrVehicleTitle } from "../../lokalizacje/location-page";

export async function generateMetadata(props: PageProps<"/budowy/[id]">): Promise<Metadata> {
  return { title: await siteOrVehicleTitle((await props.params).id, "budowa") };
}

/** Strona budowy: sprzęt, który jest tu teraz. */
export default async function SitePage(props: PageProps<"/budowy/[id]">) {
  return <EquipmentPage id={(await props.params).id} kind="budowa" />;
}
