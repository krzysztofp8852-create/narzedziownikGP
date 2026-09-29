import Link from "next/link";
import { t } from "@/i18n/t";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "@/legal/documents";

/**
 * Odnośniki do regulaminu, polityki prywatności i umowy powierzenia (logowanie, ustawienia, strona o programie).
 * `className` zastępuje domyślny wygląd, np. na stronie o programie odnośniki wyglądają jak reszta stopki.
 */
export function LegalLinks({ className = "legal-links" }: { className?: string }) {
  return (
    <nav className={className} aria-label={t("legal.nav")}>
      {LEGAL_DOCUMENT_IDS.map((id) => (
        <Link key={id} href={LEGAL_DOCUMENTS[id].path}>
          {t(`legal.documents.${id}`)}
        </Link>
      ))}
    </nav>
  );
}
