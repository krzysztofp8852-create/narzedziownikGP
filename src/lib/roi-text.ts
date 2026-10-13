import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { tier, type TierId } from "@/registry/subscriptions";

/**
 * Wariant środkowy szacunku strat z docs/research/straty-narzedzi-i-czas-szukania.md (rozdz. 4), na jednego pracownika fizycznego:
 * zgubione i skradzione narzędzia, godziny na szukanie narzędzi i powroty do bazy po zapomniane, tygodnie pracy w roku
 * i koszt godziny pracodawcy (przeciętne wynagrodzenie w budownictwie wg GUS ze składkami pracodawcy).
 */
export const ROI_ASSUMPTIONS = { toolLossPerWorker: 600, searchHoursPerWeek: 1.5, workWeeks: 45, hourlyCost: 64 };

/** Co najczęściej ginie z polskich budów, % wskazań: BauWatch Crime Report 2026 – Polska (rozdz. 1.1 researchu). */
export const STOLEN_ON_SITES = [
  { item: "tools", share: 49.8 },
  { item: "copper", share: 47.2 },
  { item: "fuel", share: 39 },
  { item: "steel", share: 32.8 },
] as const;

/** Przykładowe firmy: mała 1–10, średnia 11–50 i duża 51+ pracowników, każda z pakietem, który ją obejmie. */
const ROI_FIRMS: readonly { size: "small" | "medium" | "large"; workers: number; tierId: TierId }[] = [
  { size: "small", workers: 5, tierId: "maly" },
  { size: "medium", workers: 25, tierId: "sredni" },
  { size: "large", workers: 100, tierId: "duzy" },
];

/** Opłacalność programu w przykładowej firmie, tekstami jak w cenniku. */
export interface RoiCase {
  size: "small" | "medium" | "large";
  workers: number;
  tierName: string;
  totalLoss: string;
  /** Wdrożenie i utrzymanie w pierwszym roku. */
  firstYearCost: string;
  nextYearCost: string;
  /** Pierwszy rok programu jako procent rocznych strat, dokładnie (szerokość słupka). */
  firstYearShare: number;
  /** Ten sam procent do podpisu, w górę do pełnego: „14%”. */
  firstYearPercent: string;
  /** Samo utrzymanie w kolejnych latach jako procent strat: „2%”, „poniżej 1%”. */
  nextYearPercent: string;
}

const percent = (share: number) => (share < 1 ? t("landing.roi.belowOnePercent") : `${Math.ceil(share)}%`);

export function roiCases(): RoiCase[] {
  const { toolLoss, timeCost } = perWorkerLoss();
  return ROI_FIRMS.map(({ size, workers, tierId }) => {
    const plan = tier(tierId);
    const totalLoss = workers * (toolLoss + timeCost);
    const firstYearCost = plan.implementationPrice + plan.yearlyPrice;
    const firstYearShare = (firstYearCost / totalLoss) * 100;
    return {
      size,
      workers,
      tierName: plan.name,
      totalLoss: formatPrice(totalLoss),
      firstYearCost: formatPrice(firstYearCost),
      nextYearCost: formatPrice(plan.yearlyPrice),
      firstYearShare,
      firstYearPercent: percent(firstYearShare),
      nextYearPercent: percent((plan.yearlyPrice / totalLoss) * 100),
    };
  });
}

/** Roczna strata na jednego pracownika: narzędzia i czas szukania w złotówkach. */
export function perWorkerLoss() {
  const { toolLossPerWorker, searchHoursPerWeek, workWeeks, hourlyCost } = ROI_ASSUMPTIONS;
  const timeCost = searchHoursPerWeek * workWeeks * hourlyCost;
  return { toolLoss: toolLossPerWorker, timeCost, total: toolLossPerWorker + timeCost };
}
