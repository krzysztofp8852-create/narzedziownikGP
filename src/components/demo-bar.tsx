import Link from "next/link";
import { enterDemo } from "@/app/demo/actions";
import { DEMO_ROLES } from "@/demo/company";
import { t } from "@/i18n/t";
import type { Role } from "@/registry/registry";
import { DemoRoleButton } from "./demo-role-button";
import { DEMO_TOUR_HREF } from "./demo-tour";

/** Pasek pod nagłówkiem w firmie demo: przełączanie roli bez wylogowania i ponowne włączenie przewodnika. */
export function DemoBar({ role }: { role: Role }) {
  return (
    <div className="demo-bar" data-testid="demo-bar">
      <form action={enterDemo} className="demo-bar-inner">
        <span className="tag tag-demo">{t("demo.bar.label")}</span>
        <span className="demo-bar-roles" data-tour="demo-roles">
          <span className="demo-bar-switch">{t("demo.bar.switch")}</span>
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
          <Link href={DEMO_TOUR_HREF}>{t("demo.bar.tour")}</Link>
          <Link href="/demo">{t("demo.bar.about")}</Link>
        </span>
      </form>
    </div>
  );
}
