"use server";

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
