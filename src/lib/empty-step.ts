import { currentLocale, type MessageKey, t } from "@/i18n/t";
import {
  canManageDeadlines,
  canManageLocations,
  canManageQualifications,
  canManageRates,
  canManageTools,
  type Role,
  type Session,
} from "@/registry/registry";
import { boardOperationHref } from "./board-view";

/** Kolejny krok pustego ekranu: przycisk (Skanuj otwiera skaner na miejscu) albo informacja, kto może to zrobić. */
export type EmptyStep = { kind: "link"; href: string; label: string } | { kind: "scan"; label: string } | { kind: "who"; text: string };

/** Zdanie „kto może” z listą ról, np. „Budowy dodaje {roles}.” */
export type WhoKey = Extract<MessageKey, `emptyState.who.${string}`>;

const ROLES: Role[] = ["wlasciciel", "kierownik", "magazynier", "pracownik"];

/**
 * Kolejny krok pustego ekranu według uprawnienia `can` (tej samej funkcji, której pilnuje strona z tą czynnością): kto je
 * ma, dostaje przycisk `action`, a pozostali zdanie `who` z rolami, które je mają, wyliczonymi z `can` dla tej samej osoby
 * w każdej roli. `action` null: formularz stoi tuż pod spodem, więc uprawniony nie potrzebuje przycisku. `allowed`: gdy
 * uprawnienie zależy od miejsca (np. kierownik tylko swojej budowy), o przycisku rozstrzyga ono, a `can` to reguła dla ról.
 * W trybie tylko do odczytu nikt nic nie zrobi, więc nie ma ani przycisku, ani informacji.
 */
export function emptyStep(
  session: Session,
  can: (session: Session) => boolean,
  action: { href: string; label: string } | null,
  who: WhoKey,
  allowed = can(session),
): EmptyStep | null {
  if (session.company.readOnly) return null;
  if (allowed) return action && { kind: "link", ...action };
  const roles = ROLES.filter((role) => can({ ...session, role }));
  if (roles.length === 0) return null;
  const names = roles.map((role) => t(`emptyState.roles.${role}`));
  return { kind: "who", text: t(who, { roles: new Intl.ListFormat(currentLocale(), { type: "disjunction" }).format(names) }) };
}

const addTool = () => ({ href: boardOperationHref("narzedzie"), label: t("board.addTool") });

/** „Dodaj narzędzie” na tablicy; pozostali dowiadują się, kto dodaje narzędzia. */
export function addToolStep(session: Session): EmptyStep | null {
  return emptyStep(session, canManageTools, addTool(), "emptyState.who.tools");
}

/** Kategorię dodaje się w formularzu „Dodaj narzędzie” na tablicy; pozostali dowiadują się, kto ją doda. */
export function addCategoryStep(session: Session): EmptyStep | null {
  return emptyStep(session, canManageTools, addTool(), "emptyState.who.categories");
}

// Poniżej kroki bez przycisku: uprawniony ma formularz na tej samej stronie, a pozostali dowiadują się, kto może.

/** Budowy dodaje się kaflem „Dodaj budowę” na stronie Budowy. */
export const addSiteStep = (session: Session) => emptyStep(session, canManageLocations, null, "emptyState.who.sites");

/** Pojazdy dodaje się kaflem „Dodaj pojazd” na stronie Pojazdy. */
export const addVehicleStep = (session: Session) => emptyStep(session, canManageLocations, null, "emptyState.who.vehicles");

/** Terminy narzędzia i pojazdu dodaje się na ich karcie. */
export const addDeadlineStep = (session: Session) => emptyStep(session, canManageDeadlines, null, "emptyState.who.deadlines");

/** Uprawnienia osoby wpisuje się na jej karcie. */
export const addQualificationStep = (session: Session) => emptyStep(session, canManageQualifications, null, "emptyState.who.qualifications");

/** Stawkę dzienną ustawia się formularzem przy kosztach albo w ustawieniach. */
export const setRateStep = (session: Session) => emptyStep(session, canManageRates, null, "emptyState.who.rates");
