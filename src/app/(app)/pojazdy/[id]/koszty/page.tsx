import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { CostsPage, placeTitle } from "../../../lokalizacje/location-page";

export async function generateMetadata(props: PageProps<"/pojazdy/[id]/koszty">): Promise<Metadata> {
  const name = await placeTitle((await props.params).id, "pojazd");
  return { title: name ? `${t("costs.tab")}: ${name}` : undefined };
}

/** Zakładka „Koszty” pojazdu: koszt sprzętu w wybranym okresie. */
export default async function VehicleCostsPage(props: PageProps<"/pojazdy/[id]/koszty">) {
  return <CostsPage id={(await props.params).id} kind="pojazd" searchParams={await props.searchParams} />;
}
