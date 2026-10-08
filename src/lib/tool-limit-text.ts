import { t } from "@/i18n/t";
import type { ToolLimitWarning } from "@/registry/registry";

/** Ostrzeżenie o przekroczonym limicie narzędzi w pakiecie, pod zapisanym poleceniem; bez przekroczenia nic. */
export function toolLimitText(warning: ToolLimitWarning | null): string | undefined {
  if (!warning || warning.tier.toolLimit === null) return undefined;
  return t("toolLimit.warning", {
    tier: warning.tier.name,
    count: warning.toolCount,
    limit: warning.tier.toolLimit,
    suggested: warning.suggestedTier.name,
  });
}
