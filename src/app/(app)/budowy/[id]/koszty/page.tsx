import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { CostsPage, siteOrVehicleTitle } from "../../../lokalizacje/location-page";

export async function generateMetadata(props: PageProps<"/budowy/[id]/koszty">): Promise<Metadata> {
  const name = await siteOrVehicleTitle((await props.params).id, "budowa");
  return { title: name ? `${t("costs.tab")}: ${name}` : undefined };
}

/** Zakładka „Koszty” budowy: koszt sprzętu w wybranym okresie. */
export default async function SiteCostsPage(props: PageProps<"/budowy/[id]/koszty">) {
  return <CostsPage id={(await props.params).id} kind="budowa" searchParams={await props.searchParams} />;
}
