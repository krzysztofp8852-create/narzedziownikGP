"use server";

import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { revalidatePunchPages } from "@/lib/punch-pages";
import { getRegistry } from "@/lib/registry-instance";
import type { PhonePosition, PunchOutcome } from "@/registry/registry";

export interface PunchState {
  outcome?: PunchOutcome;
  error?: string;
}

/**
 * Odbicie skanem plakatu. Położenie telefonu idzie tylko do Rejestru, który liczy z niego odległość; tu go nie
 * zapisujemy ani nie wypisujemy do logów.
 */
export async function punch(input: { posterToken: string; operationId: string; position: PhonePosition | null; confirmExit: boolean }): Promise<PunchState> {
  const session = await requireSession();
  try {
    const outcome = await getRegistry().as(session.userId).punch(input);
    if (outcome.action !== "potwierdz_wyjscie") revalidatePunchPages();
    return { outcome };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
