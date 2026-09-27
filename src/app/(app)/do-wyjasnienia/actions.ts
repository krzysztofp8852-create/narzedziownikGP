"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/** „Wyjaśnione”: odrzucony ruch znika z listy autora. */
export async function resolveRejectedMovement(rejectionId: string) {
  const session = await requireSession();
  await getRegistry().as(session.userId).resolveRejectedMovement(rejectionId);
  revalidatePath("/do-wyjasnienia");
}
