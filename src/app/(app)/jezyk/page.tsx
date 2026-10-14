import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { LanguageSection } from "./language-section";

export const generateMetadata = (): Metadata => ({ title: t("language.title") });

/** Język interfejsu: każda rola wybiera go sama dla siebie (ADR 0047). */
export default async function LanguagePage() {
  const session = await requireSession();
  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("language.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("language.title")}</h1>
      <div className="company-grid">
        <LanguageSection demo={session.company.demo} />
      </div>
    </>
  );
}
