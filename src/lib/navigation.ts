import { t } from "@/i18n/t";
import { HELP_HREF, SCAN_HREF, SITES_HREF } from "@/lib/nav-path";
import {
  canManageQualifications,
  canManageSettings,
  canPrintStickers,
  canSeeCosts,
  canSeeReports,
  canSeeTimeOnSiteSummary,
  canUseSupportChat,
  hasTutorial,
  type Role,
  type Session,
} from "@/registry/registry";

/** Ikona pozycji paska; rysuje ją widok nawigacji. */
export type NavIcon = "board" | "tools" | "scan" | "sites" | "people" | "deadlines" | "report" | "more" | "mine";

/** Pozycja dolnego paska i góry panelu bocznego: odnośnik (`primary` to wyróżnione Skanuj) albo przycisk „Więcej”. */
export type BarItem =
  | { kind: "link"; href: string; label: string; icon: NavIcon; primary?: true }
  | { kind: "more"; label: string; icon: NavIcon };

export interface NavLink {
  href: string;
  label: string;
}

/** Grupa pod „Więcej”; bez nazwy stoi osobno na końcu (Pomoc). */
export interface NavGroup {
  label: string | null;
  items: NavLink[];
}

/** Części strony Moje konto. Hasło zmienia się linkiem z e-maila, a pracownikowi (loguje się nazwą) nadaje je właściciel. */
export type AccountSection = "language" | "passwordLink" | "passwordFromOwner" | "deleteAccount" | "signOut";

/** Części strony Pomoc. */
export type HelpSection = "chat" | "tutorial";

export interface Navigation {
  bar: BarItem[];
  /** Grupy pod „Więcej” (u pracownika „Moje”); pusta lista: pasek nie ma tej pozycji. */
  more: NavGroup[];
  account: AccountSection[];
  /** Pusta lista: nie ma strony Pomoc ani pozycji, która do niej prowadzi. */
  help: HelpSection[];
}


type BarKey = "board" | "tools" | "scan" | "sites" | "people" | "deadlines" | "report";
type GroupKey = "equipment" | "people" | "company" | "help";

/** Kolejność paska każdego konta; „Więcej” (u pracownika „Moje”) zawsze na końcu. */
const BAR: Record<Role, BarKey[]> = {
  wlasciciel: ["board", "tools", "scan", "sites"],
  kierownik: ["board", "sites", "scan", "people"],
  magazynier: ["board", "tools", "scan", "deadlines"],
  pracownik: ["board", "scan", "report"],
};

/** Pracownik ma pod „Moje” tylko swoje sprawy, bez modułów sprzętu i firmy. */
const MORE: Record<Role, GroupKey[]> = {
  wlasciciel: ["equipment", "people", "company", "help"],
  kierownik: ["equipment", "people", "company", "help"],
  magazynier: ["equipment", "people", "company", "help"],
  pracownik: ["people"],
};

const link = (href: string, label: string, visible = true): NavLink[] => (visible ? [{ href, label }] : []);

/**
 * Nawigacja konta: dolny pasek na telefonie i panel boczny na komputerze to dwa widoki tego modelu. Widoczność według
 * tych samych funkcji uprawnień, których pilnują strony, żeby nawigacja nie prowadziła na „brak dostępu”. Pozycja paska
 * nie powtarza się pod „Więcej”, a puste grupy znikają. W trybie tylko do odczytu nie ma operacji (Skanuj, Zgłoś).
 * Strona Ludzie pokazuje magazynierowi i pracownikowi tylko ich uprawnienia, a Czas na budowie tylko ich czas.
 */
export function navigation(session: Session): Navigation {
  const writable = !session.company.readOnly;
  const people = canManageQualifications(session);
  const help: HelpSection[] = [...(canUseSupportChat(session) ? ["chat" as const] : []), ...(hasTutorial(session) ? ["tutorial" as const] : [])];

  const bar: Record<BarKey, BarItem | null> = {
    board: { kind: "link", href: "/", label: t("nav.board"), icon: "board" },
    tools: { kind: "link", href: "/narzedzia", label: t("nav.tools"), icon: "tools" },
    scan: writable ? { kind: "link", href: SCAN_HREF, label: t("nav.scan"), icon: "scan", primary: true } : null,
    sites: { kind: "link", href: SITES_HREF, label: t(session.role === "kierownik" ? "nav.mySites" : "nav.sites"), icon: "sites" },
    people: { kind: "link", href: "/ludzie", label: t(people ? "nav.people" : "nav.myQualifications"), icon: "people" },
    deadlines: { kind: "link", href: "/terminy", label: t("nav.deadlines"), icon: "deadlines" },
    report: writable ? { kind: "link", href: "/zgloszenia/nowe", label: t("nav.report"), icon: "report" } : null,
  };
  const barItems = BAR[session.role].flatMap((key) => bar[key] ?? []);
  const inBar = new Set(barItems.map((item) => (item.kind === "link" ? item.href : null)));

  const groups: Record<GroupKey, NavGroup> = {
    equipment: {
      label: t("nav.groups.equipment"),
      items: [
        ...link("/narzedzia", t("nav.tools")),
        ...link(SITES_HREF, t("nav.sites")),
        ...link("/pojazdy", t("nav.vehicles")),
        ...link("/terminy", t("nav.deadlines")),
        ...link("/historia", t("nav.history")),
        ...link("/koszty", t("nav.costs"), canSeeCosts(session)),
      ],
    },
    people: {
      label: t(people ? "nav.groups.people" : "nav.groups.mine"),
      items: [
        ...link("/ludzie", t(people ? "nav.people" : "nav.myQualifications")),
        ...link("/czas", t(canSeeTimeOnSiteSummary(session) ? "nav.timeOnSite" : "nav.myTimeOnSite")),
      ],
    },
    company: {
      label: t("nav.groups.company"),
      items: [
        ...link("/raporty", t("nav.reports"), canSeeReports(session)),
        ...link("/naklejki", t("nav.stickers"), canPrintStickers(session)),
        ...link("/ustawienia", t("nav.settings"), canManageSettings(session)),
      ],
    },
    help: { label: null, items: link(HELP_HREF, t("nav.help"), help.length > 0) },
  };
  const more = MORE[session.role]
    .map((key) => ({ ...groups[key], items: groups[key].items.filter((item) => !inBar.has(item.href)) }))
    .filter((group) => group.items.length > 0);

  const mine = session.role === "pracownik";
  return {
    bar: more.length > 0 ? [...barItems, { kind: "more", label: t(mine ? "nav.mine" : "nav.more"), icon: mine ? "mine" : "more" }] : barItems,
    more,
    account: [
      "language",
      // Konta demo są wspólne dla wszystkich oglądających, więc hasła nikt w nich nie zmienia.
      ...(session.company.demo ? [] : [mine ? ("passwordFromOwner" as const) : ("passwordLink" as const)]),
      "deleteAccount",
      "signOut",
    ],
    help,
  };
}
