import Link from "next/link";
import { enterDemo } from "@/app/demo/actions";
import { DEMO_ROLES } from "@/demo/company";
import { t } from "@/i18n/t";
import type { Role } from "@/registry/registry";
import { CurrentPathInput } from "./current-path-input";
import { DemoRoleButton } from "./demo-role-button";
import { DEMO_TOUR_HREF } from "./demo-tour";

/**
 * Pasek pod nagłówkiem w firmie demo: przełączanie roli bez wylogowania (na tej samej stronie, jeśli widzi ją każda
 * rola) i ponowne włączenie przewodnika. Na telefonie to jeden wiersz: role przewijają się w poziomie, a linki są
 * ikonami.
 */
export function DemoBar({ role }: { role: Role }) {
  return (
    <div className="demo-bar" data-testid="demo-bar">
      <form action={enterDemo} className="demo-bar-inner">
        <CurrentPathInput name="wroc" />
        <span className="tag tag-demo">{t("demo.bar.label")}</span>
        <span className="demo-bar-roles" data-tour="demo-roles" role="group" aria-label={t("demo.bar.switch")}>
          <span className="demo-bar-switch" aria-hidden>
            {t("demo.bar.switch")}
          </span>
          {DEMO_ROLES.map((candidate) => (
            <DemoRoleButton
              key={candidate}
              role={candidate}
              label={t(`roles.${candidate}`)}
              className="button button-quiet button-small"
              current={candidate === role}
            />
          ))}
        </span>
        <span className="demo-bar-links">
          <Link href={DEMO_TOUR_HREF} className="demo-bar-link" aria-label={t("demo.bar.tour")} title={t("demo.bar.tour")}>
            <span className="demo-bar-link-icon" aria-hidden>
              ?
            </span>
            <span className="demo-bar-link-text">{t("demo.bar.tour")}</span>
          </Link>
          <Link href="/demo" className="demo-bar-link" aria-label={t("demo.bar.about")} title={t("demo.bar.about")}>
            <span className="demo-bar-link-icon" aria-hidden>
              i
            </span>
            <span className="demo-bar-link-text">{t("demo.bar.about")}</span>
          </Link>
        </span>
      </form>
    </div>
  );
}
