import { t } from "@/i18n/t";

/** Kontakt handlowy GP Engineering dla oglądających demo. */
const SALES_PHONE = { label: "576 763 536", href: "tel:+48576763536" };
const SALES_EMAIL = "kontakt@gp-engineering.pl";

/** Telefon i e-mail działu handlowego (strona o programie, strona /demo i okno 💬 w firmie demo). */
export function SalesContact() {
  return (
    <p>
      {t("demo.contactPhone")} <a href={SALES_PHONE.href}>{SALES_PHONE.label}</a>
      {" · "}
      {t("demo.contactEmail")} <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
    </p>
  );
}
