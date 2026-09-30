import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { PaidUntil, RecorderUsage, SubscriptionStatus, ToolUsage } from "./subscription-status";

export const metadata: Metadata = { title: t("superAdmin.companiesTitle") };

/** Wszystkie firmy z progiem, liczbą narzędzi, pakietem wdrożenia, liczbą osób zapisujących ruchy, „opłacone do” i stanem abonamentu. */
export default async function CompaniesPage() {
  const companies = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .companies();

  return (
    <>
      <div className="page-head">
        <h1 className="display page-title">{t("superAdmin.companiesTitle")}</h1>
        <Link href="/super-admin/nowa-firma" className="button">
          {t("superAdmin.newCompany")}
        </Link>
      </div>
      {companies.length === 0 ? (
        <p className="empty">{t("superAdmin.companiesEmpty")}</p>
      ) : (
        <div className="import-table-wrap">
          <table className="import-table">
            <thead>
              <tr>
                <th>{t("superAdmin.columnCompany")}</th>
                <th>{t("superAdmin.columnTier")}</th>
                <th className="import-number">{t("superAdmin.columnTools")}</th>
                <th>{t("superAdmin.columnImplementation")}</th>
                <th className="import-number">{t("superAdmin.columnRecorders")}</th>
                <th>{t("superAdmin.columnPaidUntil")}</th>
                <th>{t("superAdmin.columnStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} data-testid="company-row">
                  <td>
                    <Link href={`/super-admin/firmy/${company.id}`}>{company.name}</Link>
                  </td>
                  <td>{company.tier.name}</td>
                  <td className="import-number">
                    <ToolUsage company={company} />
                  </td>
                  <td>{company.implementationTier.name}</td>
                  <td className="import-number">
                    <RecorderUsage company={company} />
                  </td>
                  <td>
                    <PaidUntil company={company} />
                  </td>
                  <td>
                    <SubscriptionStatus company={company} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
