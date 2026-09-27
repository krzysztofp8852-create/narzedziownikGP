import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { formatCalendarDay, formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { TIERS } from "@/registry/registry";
import { PaidUntil, SubscriptionStatus, ToolUsage } from "../../subscription-status";
import { PaidUntilForm, ReadOnlyForm, TierForm } from "./subscription-forms";

/** Jedna firma na żądanie, wspólna dla tytułu strony i jej treści. */
const loadCompany = cache(async (companyId: string) =>
  getRegistry()
    .superAdmin(await requireSuperAdmin())
    .company(companyId),
);

export async function generateMetadata(props: PageProps<"/super-admin/firmy/[id]">): Promise<Metadata> {
  const company = await loadCompany((await props.params).id);
  return { title: company?.name };
}

/** Firma z abonamentem: dane do faktury, próg, „opłacone do” i ręczny tryb tylko do odczytu. */
export default async function CompanyPage(props: PageProps<"/super-admin/firmy/[id]">) {
  const company = await loadCompany((await props.params).id);
  if (!company) notFound();

  const none = t("superAdmin.none");
  const details: [label: string, value: React.ReactNode][] = [
    [t("superAdmin.columnStatus"), <SubscriptionStatus key="status" company={company} />],
    [t("superAdmin.columnTier"), t("superAdmin.tierOption", { name: company.tier.name, limit: company.tier.toolLimit, price: company.tier.monthlyPrice })],
    [t("superAdmin.tools"), <ToolUsage key="tools" company={company} />],
    [t("superAdmin.columnPaidUntil"), <PaidUntil key="paid" company={company} />],
    [t("superAdmin.readOnlyFrom"), company.readOnlyFrom ? formatCalendarDay(company.readOnlyFrom) : none],
    [t("superAdmin.owner"), company.owner ? `${company.owner.fullName} (${company.owner.email})` : none],
    [t("superAdmin.createdAt"), formatDateTime(company.createdAt)],
  ];
  const invoice: [label: string, value: string][] = company.invoice
    ? [
        [t("superAdmin.invoiceName"), company.invoice.name],
        [t("superAdmin.taxId"), company.invoice.taxId],
        [t("superAdmin.invoiceAddress"), company.invoice.address],
      ]
    : [[t("superAdmin.sectionInvoice"), t("superAdmin.noInvoice")]];

  return (
    <>
      <p>
        <Link href="/super-admin" className="muted">
          {t("superAdmin.back")}
        </Link>
      </p>
      <h1 className="display page-title">{company.name}</h1>
      <div className="company-grid">
        <section className="company-card" aria-labelledby="company-details">
          <h2 id="company-details" className="display section-title">
            {t("superAdmin.detailsTitle")}
          </h2>
          <dl className="details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="company-card" aria-labelledby="company-invoice">
          <h2 id="company-invoice" className="display section-title">
            {t("superAdmin.sectionInvoice")}
          </h2>
          <dl className="details">
            {invoice.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="preserve-lines">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="company-card" aria-labelledby="company-subscription">
          <h2 id="company-subscription" className="display section-title">
            {t("superAdmin.sectionSubscription")}
          </h2>
          <TierForm company={company} tiers={[...TIERS]} />
          <PaidUntilForm company={company} />
        </section>
        <section className="company-card" aria-labelledby="company-read-only">
          <h2 id="company-read-only" className="display section-title">
            {t("superAdmin.readOnlyTitle")}
          </h2>
          <ReadOnlyForm company={company} />
        </section>
      </div>
    </>
  );
}
