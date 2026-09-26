"use server";

import { revalidatePath } from "next/cache";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { MAX_ALARM_THRESHOLD_DAYS } from "@/registry/registry";

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
