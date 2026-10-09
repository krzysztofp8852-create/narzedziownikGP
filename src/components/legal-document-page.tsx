import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import type { LegalDocumentId } from "@/legal/documents";
import type { Inline, LegalBlock } from "@/legal/parse";
import { readLegalDocument } from "@/legal/read";
import { LegalLinks } from "./legal-links";
import { VisitorCookieConsent } from "./visitor-cookie-consent";

export function legalDocumentMetadata(id: LegalDocumentId): Metadata {
  return { title: t(`legal.documents.${id}`) };
}

function Text({ content }: { content: Inline[] }) {
  return content.map((part, index) =>
    part.href ? (
      <Link key={index} href={part.href}>
        {part.text}
      </Link>
    ) : part.strong ? (
      <strong key={index}>{part.text}</strong>
    ) : (
      part.text
    ),
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "heading": {
      const Heading = block.level === 2 ? "h2" : "h3";
      return <Heading id={block.id}>{block.text}</Heading>;
    }
    case "paragraph":
      return (
        <p>
          <Text content={block.content} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <Text content={item.content} />
          {item.children.length > 0 && (
            <ul>
              {item.children.map((child, childIndex) => (
                <li key={childIndex}>
                  <Text content={child} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ));
      return block.ordered ? <ol start={block.start}>{items}</ol> : <ul>{items}</ul>;
    }
  }
}

/**
 * Regulamin, polityka prywatności albo umowa powierzenia. Otwiera się bez logowania, a „Wróć” prowadzi na `/`:
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
            {document.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </article>
        </main>
        <div className="hazard" aria-hidden />
      </div>
      <VisitorCookieConsent />
    </>
  );
}
