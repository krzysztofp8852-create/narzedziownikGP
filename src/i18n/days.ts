import { t } from "./t";

/** „1 dzień”, „3 dni”. */
export function formatDays(count: number): string {
  return t(count === 1 ? "days.one" : "days.many", { count });
}
