import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { siteOrVehicleTitle } from "../../../lokalizacje/location-page";
import { PeopleOnSitePage } from "../../../lokalizacje/people-on-site";

export async function generateMetadata(props: PageProps<"/budowy/[id]/ludzie">): Promise<Metadata> {
  const name = await siteOrVehicleTitle((await props.params).id, "budowa");
  return { title: name ? `${t("punches.tab")}: ${name}` : undefined };
}

/** Zakładka „Ludzie na budowie”: kto jest odbity teraz i historia odbić. */
export default async function SitePeoplePage(props: PageProps<"/budowy/[id]/ludzie">) {
  return <PeopleOnSitePage id={(await props.params).id} kind="budowa" />;
}
