import type { DemoRole } from "@/demo/company";

/** Krok przewodnika demo; jego tytuł i treść są w `demo.tour.<id>`. */
export type TourStepId = "issue" | "where" | "return" | "punch" | "report" | "finish";

export interface TourStep {
  id: TourStepId;
  /** Element, przy którym stoi dymek (`data-tour`); dopóki go nie ma na stronie, dymek stoi na środku ekranu. */
  target: string;
}

const TARGETS: Record<TourStepId, string> = {
  // Wydaj i Zwróć to przyciski operacji tablicy, a „Gdzie jest sprzęt” to siatka kafli miejsc.
  issue: "issue",
  where: "where",
  return: "return",
  // Odbicie to Skanuj z nawigacji (plakat budowy rozpoznaje sam), a usterkę pracownik zgłasza z „Zgłoś”.
  punch: "scan",
  report: "report",
  // Na koniec przełącznik ról na pasku demo: ta sama firma oczami innej osoby.
  finish: "demo-roles",
};

/**
 * Przewodnik wokół jednego zadania: kto rusza sprzęt, wydaje go na budowę, sprawdza, u kogo jest, i przyjmuje zwrot;
 * pracownik odbija się i zgłasza usterkę. Ostatni krok podaje cenę i prowadzi do innych ról.
 */
const ROLE_STEPS: Record<DemoRole, TourStepId[]> = {
  wlasciciel: ["issue", "where", "return", "finish"],
  kierownik: ["issue", "where", "return", "finish"],
  magazynier: ["issue", "where", "return", "finish"],
  pracownik: ["punch", "report", "finish"],
};

export function tourSteps(role: DemoRole): TourStep[] {
  return ROLE_STEPS[role].map((id) => ({ id, target: TARGETS[id] }));
}

/** Zapamiętany stan przewodnika roli, gdy oglądający go skończył (inaczej numer kroku). */
export const TOUR_DONE = "koniec";

/**
 * Od którego kroku włączyć przewodnik (null: nie włączać). Sam włącza się przy wejściu do roli i idzie dalej od
 * zapamiętanego kroku, chyba że oglądający go pominął albo skończył. „Przewodnik” na pasku demo (`requested`) wznawia
 * pominięty od kroku, na którym go pominięto, a skończony albo nieoglądany zaczyna od początku.
 */
export function tourStart({ requested, saved, skipped, count }: { requested: boolean; saved: string | null; skipped: boolean; count: number }) {
  if (!requested && (skipped || saved === TOUR_DONE)) return null;
  const step = saved === null || saved === TOUR_DONE ? 0 : Number.parseInt(saved, 10);
  return Number.isInteger(step) ? Math.min(Math.max(step, 0), count - 1) : 0;
}
