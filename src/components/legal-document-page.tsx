import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import type { LegalDocumentId } from "@/legal/documents";
import { readLegalDocument } from "@/legal/read";
import { LegalLinks } from "./legal-links";
import { MarkdownBlocks } from "./markdown-blocks";
import { VisitorCookieConsent } from "./visitor-cookie-consent";

export function legalDocumentMetadata(id: LegalDocumentId): Metadata {
  return { title: t(`legal.documents.${id}`) };
}

/**
 * Regulamin, polityka prywatności, umowa powierzenia albo strona „Usuń konto”. Otwiera się bez logowania, a „Wróć” prowadzi na `/`:
 * niezalogowany trafia na stronę o programie, zalogowany na tablicę. Niezalogowany widzi też baner zgody na cookies.
 */
export async function LegalDocumentPage({ id }: { id: LegalDocumentId }) {
  const document = await readLegalDocument(id);
  return (
    <>
      <div className="auth-page">
        <div className="hazard" aria-hidden />
        <main className="legal-main">
          <header className="legal-head">
            <div className="brand">
              <p className="display brand-name">
                {t("app.nameLead")}
                <span>{t("app.nameMark")}</span>
              </p>
              <p className="muted">{t("app.vendor")}</p>
            </div>
            <Link href="/" className="muted">
              {t("legal.back")}
            </Link>
          </header>
          <LegalLinks />
          <article className="legal-document" aria-labelledby="legal-title">
            <h1 id="legal-title" className="display page-title">
              {document.title}
            </h1>
            <p className="muted">{t("legal.version", { date: document.version })}</p>
            {document.draft && (
              <p className="legal-draft" role="note">
                {t("legal.draft")}
              </p>
            )}
            <MarkdownBlocks blocks={document.blocks} />
          </article>
        </main>
        <div className="hazard" aria-hidden />
      </div>
      <VisitorCookieConsent />
    </>
  );
}
