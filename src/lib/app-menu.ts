import { t } from "@/i18n/t";
import {
  canClarifyPunches,
  canManageQualifications,
  canManageSettings,
  canPrintStickers,
  canSeeCosts,
  canSeeTimeOnSiteSummary,
  hasTutorial,
  type Session,
} from "@/registry/registry";

export type MenuItem = { kind: "link"; href: string; label: string } | { kind: "signOut"; label: string };

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const link = (href: string, label: string, visible = true): MenuItem[] => (visible ? [{ kind: "link", href, label }] : []);

/**
 * Podstrony, które aktor może otworzyć, w grupach menu pod trzema kreskami. Widoczność według tych samych funkcji
 * uprawnień, których pilnują strony, żeby menu nie prowadziło na „brak dostępu”. Budowy, pojazdy i dokumenty nie mają
 * jeszcze własnych stron, więc prowadzą do swoich sekcji tablicy i ustawień. Strona Ludzie pokazuje magazynierowi
 * i pracownikowi tylko ich własne uprawnienia, a strona Czas na budowie tylko ich własny czas, stąd inne nazwy pozycji. Puste grupy znikają.
 */
export function appMenu(session: Session): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      label: t("menu.groups.equipment"),
      items: [
        ...link("/", t("menu.board")),
        ...link("/terminy", t("menu.deadlines")),
        ...link("/historia", t("menu.history")),
        ...link("/naklejki", t("menu.stickers"), canPrintStickers(session)),
      ],
    },
    {
      label: t("menu.groups.places"),
      items: [
        ...link("/#budowy", t("menu.sites")),
        ...link("/#board-vehicles", t("menu.vehicles")),
        ...link("/koszty", t("menu.costs"), canSeeCosts(session)),
      ],
    },
    {
      label: t("menu.groups.people"),
      items: [
        ...link("/ludzie", canManageQualifications(session) ? t("menu.people") : t("menu.myQualifications")),
        ...link("/czas", canSeeTimeOnSiteSummary(session) ? t("menu.timeOnSite") : t("menu.myTimeOnSite")),
        ...link("/odbicia", t("menu.punchesToClarify"), canClarifyPunches(session)),
      ],
    },
    {
      label: t("menu.groups.company"),
      items: [
        ...link("/ustawienia#legal", t("menu.documents"), canManageSettings(session)),
        ...link("/ustawienia", t("menu.settings"), canManageSettings(session)),
        ...link("/samouczek", t("menu.tutorial"), hasTutorial(session)),
        { kind: "signOut", label: t("menu.logout") },
      ],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}
