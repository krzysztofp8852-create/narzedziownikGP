"use server";

import { revalidatePath } from "next/cache";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formDecimal, formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import { MAX_ALARM_THRESHOLD_DAYS, UUID_PATTERN } from "@/registry/registry";

export interface SettingsFormState {
  error?: string;
  saved?: boolean;
}

export async function updateSettings(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const session = await requireSession();
  const raw = formText(formData, "alarmThresholdDays").trim();
  if (!/^\d+$/.test(raw)) return { error: t("settings.invalidDays", { max: MAX_ALARM_THRESHOLD_DAYS }) };
  try {
    await getRegistry().as(session.userId).updateSettings({ alarmThresholdDays: Number(raw) });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  revalidatePath("/ustawienia");
  return { saved: true };
}

/** Kto poza właścicielem i autorem widzi zgłoszenia; magazynier, który ich nie widzi, nie może ich zamykać. */
export async function updateIssueVisibility(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const session = await requireSession();
  const storekeepers = formData.get("storekeepers") === "on";
  try {
    await getRegistry()
      .as(session.userId)
      .updateSettings({
        issueVisibility: {
          siteManagers: formData.get("siteManagers") === "on",
          storekeepers,
          storekeepersClose: storekeepers && formData.get("storekeepersClose") === "on",
        },
      });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}

/** Stawka dzienna firmy i stawki kategorii (puste pole: kategoria liczy się stawką firmy), razem albo wcale. */
export async function updateDailyRates(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const companyPercent = formDecimal(formData, "companyPercent");
  if (companyPercent === null) return { error: t("dailyRates.companyRequired") };
  const categories = formData
    .getAll("categoryId")
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
    .map((categoryId) => ({ categoryId, percent: formDecimal(formData, `category-${categoryId}`) }));
  if ([companyPercent, ...categories.map((category) => category.percent)].some((percent) => Number.isNaN(percent))) {
    return { error: t("dailyRates.invalidPercent") };
  }
  try {
    await registry.setDailyRates([
      { target: { kind: "firma" }, rate: companyPercent },
      ...categories.map(({ categoryId, percent }) => ({ target: { kind: "kategoria" as const, categoryId }, rate: percent })),
    ]);
  } catch (error) {
    return { error: isRegistryError(error) && error.code === "invalid_input" ? t("dailyRates.invalidPercent") : errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}
