import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { IMPLEMENTATION_TIERS, TIERS } from "@/registry/registry";
import { CreateCompanyForm } from "./create-company-form";

export const metadata: Metadata = { title: t("superAdmin.createTitle") };

/** Wdrożenie klienta po rozmowie: firma z bazą, abonamentem, pakietem wdrożenia, danymi do faktury i właścicielem. */
export default async function NewCompanyPage() {
  await requireSuperAdmin();
  return (
    <>
      <p>
        <Link href="/super-admin" className="muted">
          {t("superAdmin.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("superAdmin.createTitle")}</h1>
      <CreateCompanyForm tiers={[...TIERS]} implementationTiers={[...IMPLEMENTATION_TIERS]} defaultBaseName={t("defaults.baseName")} />
    </>
  );
}
