import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangeLogList } from "@/components/change-log-list";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canReadChangeLog } from "@/registry/registry";

export const metadata: Metadata = { title: t("changeLog.title") };

/** Dziennik zmian kont i ustawień firmy dla właściciela. */
export default async function ChangeLogPage() {
  const session = await requireSession();
  if (!canReadChangeLog(session)) redirect("/");
  const entries = await getRegistry().as(session.userId).changeLog();

  return (
    <>
      <p>
        <Link href="/ustawienia" className="muted">
          {t("changeLog.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("changeLog.title")}</h1>
      <p className="muted">{t("changeLog.intro")}</p>
      <ChangeLogList entries={entries} />
    </>
  );
}
