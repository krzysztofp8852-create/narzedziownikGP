import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { Checklist } from "../checklist";
import { loadChecklist } from "../load-checklist";

export const metadata: Metadata = { title: t("checklist.issueTitle") };

export default async function IssuePage() {
  return (
    <>
      <h1 className="display page-title">{t("checklist.issueTitle")}</h1>
      <Checklist {...await loadChecklist("wydanie")} />
    </>
  );
}
