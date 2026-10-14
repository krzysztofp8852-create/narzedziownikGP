import { currentLocale, t } from "@/i18n/t";
import { LanguageForm } from "./language-form";

/** Język interfejsu tej osoby: na stronie Język (każdy) i w ustawieniach właściciela. */
export function LanguageSection({ demo }: { demo: boolean }) {
  return (
    <section className="company-card" aria-labelledby="language">
      <h2 id="language" className="display section-title">
        {t("language.title")}
      </h2>
      <p className="muted">{t(demo ? "language.demoIntro" : "language.intro")}</p>
      <LanguageForm locale={currentLocale()} />
    </section>
  );
}
