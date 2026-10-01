import type { Metadata } from "next";
import { EquipmentPage, placeTitle } from "../../lokalizacje/location-page";

export async function generateMetadata(props: PageProps<"/budowy/[id]">): Promise<Metadata> {
  return { title: await placeTitle((await props.params).id, "budowa") };
}

/** Strona budowy: sprzęt, który jest tu teraz. */
export default async function SitePage(props: PageProps<"/budowy/[id]">) {
  return <EquipmentPage id={(await props.params).id} kind="budowa" />;
}
