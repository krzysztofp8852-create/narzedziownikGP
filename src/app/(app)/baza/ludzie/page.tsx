import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { PeopleOnSitePage } from "../../lokalizacje/people-on-site";

export const metadata: Metadata = { title: t("punches.tabBase") };

/** Zakładka „Ludzie na bazie”: kto jest odbity teraz i historia odbić. */
export default function BasePeoplePage() {
  return <PeopleOnSitePage id={null} kind="baza" />;
}
