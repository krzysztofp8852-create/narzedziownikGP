"use server";

import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import type { QueuedPunch, SendOutcome } from "@/lib/offline/queue";
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

/**
 * Odbicie z kolejki offline telefonu. Zapisane i odrzucone (konflikt do wyjaśnienia) wychodzi z kolejki; inne błędy
 * (np. tryb tylko do odczytu, awaria) zostawiają je do ponowienia. Do logów idzie tylko błąd, nigdy położenie.
 */
export async function sendQueuedPunch(item: QueuedPunch): Promise<SendOutcome> {
  const session = await requireSession();
  // Na wspólnym telefonie odbicie innej osoby czeka, aż ona się zaloguje.
  if (item.userId !== session.userId) return "retry";
  try {
    const result = await getRegistry()
      .as(session.userId)
      .registerQueuedPunch({
        operationId: item.operationId,
        posterToken: item.posterCode,
        position: item.position,
        confirmExit: item.action === "wyjscie",
        scannedAt: new Date(item.scannedAt),
      });
    revalidatePunchPages();
    return result.status;
  } catch (error) {
    console.error("Odbicie z kolejki offline czeka na ponowienie", errorMessage(error));
    return "retry";
  }
}
