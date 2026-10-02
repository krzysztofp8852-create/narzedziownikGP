import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { EquipmentPage } from "../lokalizacje/location-page";

export const metadata: Metadata = { title: t("locationPage.baseKind") };

/** Strona bazy: sprzęt, który jest tu teraz. */
export default function BasePage() {
  return <EquipmentPage id={null} kind="baza" />;
}
