import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeLogList } from "@/components/change-log-list";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

export const metadata: Metadata = { title: t("changeLog.title") };

/** Dziennik zmian kont i ustawień jednej firmy dla super-admina. */
export default async function CompanyChangeLogPage(props: PageProps<"/super-admin/firmy/[id]/dziennik">) {
  const { id } = await props.params;
  const superAdmin = getRegistry().superAdmin(await requireSuperAdmin());
  const company = await superAdmin.company(id);
  if (!company) notFound();
  const entries = await superAdmin.changeLog(id);

  return (
    <>
      <p>
        <Link href={`/super-admin/firmy/${id}`} className="muted">
          {t("changeLog.backToCompany", { name: company.name })}
        </Link>
      </p>
      <h1 className="display page-title">{t("changeLog.title")}</h1>
      <p className="muted">{t("changeLog.intro")}</p>
      <ChangeLogList entries={entries} />
    </>
  );
}
