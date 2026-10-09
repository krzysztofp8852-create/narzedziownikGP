import Link from "next/link";
import { t } from "@/i18n/t";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "@/legal/documents";
import { CookieSettingsButton } from "./cookie-consent";

/**
 * Odnośniki do regulaminu, polityki prywatności i umowy powierzenia (logowanie, ustawienia, strona o programie) oraz
 * zmiana zgody na pliki cookies tam, gdzie jest baner (strony dla odwiedzających).
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
      <CookieSettingsButton />
    </nav>
  );
}
