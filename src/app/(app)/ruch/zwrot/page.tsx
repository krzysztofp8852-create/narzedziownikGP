import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { Checklist } from "../checklist";
import { loadChecklist } from "../load-checklist";

export const metadata: Metadata = { title: t("checklist.returnTitle") };

export default async function ReturnPage() {
  return (
    <>
      <h1 className="display page-title">{t("checklist.returnTitle")}</h1>
      <Checklist {...await loadChecklist("zwrot")} />
    </>
  );
}
