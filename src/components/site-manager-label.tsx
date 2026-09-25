import { t } from "@/i18n/t";
import type { Site } from "@/registry/registry";

/** „Kierownik: Adam Nowak”, z ostrzeżeniem, gdy jego konto jest dezaktywowane. */
export function SiteManagerLabel({ manager }: { manager: Site["manager"] }) {
  const name = manager.active ? manager.fullName : t("board.managerInactive", { name: manager.fullName });
  return <span className={manager.active ? undefined : "text-danger"}>{t("board.siteManager", { name })}</span>;
}
