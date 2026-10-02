"use server";

import { parseDateTimeInput } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { revalidatePunchPages } from "@/lib/punch-pages";
import { getRegistry } from "@/lib/registry-instance";

export interface PunchFormState {
  error?: string;
  done?: boolean;
}

/** „Nowy kod”: stary plakat przestaje działać. */
export async function renewPosterToken(locationId: string): Promise<PunchFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).renewPosterToken(locationId);
    revalidatePunchPages();
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function setPunchRadius(locationId: string, _prev: PunchFormState, formData: FormData): Promise<PunchFormState> {
  const session = await requireSession();
  try {
    const raw = formText(formData, "radius").trim();
    await getRegistry()
      .as(session.userId)
      .setPunchRadius(locationId, /^\d+$/.test(raw) ? Number(raw) : Number.NaN);
    revalidatePunchPages();
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** „Wyjaśnione” z opcjonalną notatką. */
export async function explainPunch(punchId: string, _prev: PunchFormState, formData: FormData): Promise<PunchFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).explainPunch({ punchId, note: formText(formData, "note") });
    revalidatePunchPages();
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** „Wyjaśnione” przy skanie z kolejki offline, który się nie zapisał, z opcjonalną notatką. */
export async function explainPunchConflict(conflictId: string, _prev: PunchFormState, formData: FormData): Promise<PunchFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).explainPunchConflict({ conflictId, note: formText(formData, "note") });
    revalidatePunchPages();
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Godziny odbicia tak, jak pokazał je formularz poprawki (pola `datetime-local`); wyjście puste, gdy go nie było. */
export interface CorrectedPunch {
  id: string;
  entry: string;
  exit: string;
}

/** Poprawka godzin odbicia z powodem: wejście i wyjście, które formularz pokazał inaczej, w jednym poleceniu. */
export async function correctPunch(punch: CorrectedPunch, _prev: PunchFormState, formData: FormData): Promise<PunchFormState> {
  const session = await requireSession();
  const entry = formText(formData, "entry");
  const exit = formText(formData, "exit");
  if (entry === punch.entry && exit === punch.exit) return { error: t("punches.correctNothing") };
  const enteredAt = entry === punch.entry ? undefined : parseDateTimeInput(entry);
  const leftAt = exit === punch.exit ? undefined : parseDateTimeInput(exit);
  if (enteredAt === null || leftAt === null) return { error: t("punches.correctInvalidTime") };
  try {
    await getRegistry().as(session.userId).correctPunch({ punchId: punch.id, enteredAt, leftAt, reason: formText(formData, "reason") });
    revalidatePunchPages();
    return { done: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
