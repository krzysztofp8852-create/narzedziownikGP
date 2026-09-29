"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import type { TutorialOutcome } from "@/registry/registry";

/** „Pomiń samouczek” albo „Gotowe”: samouczek nie wróci sam, a użytkownik trafia na tablicę. */
export async function closeTutorial(formData: FormData) {
  const session = await requireSession();
  // Nieznany wynik odrzuca Rejestr.
  await getRegistry().as(session.userId).closeTutorial(String(formData.get("outcome")) as TutorialOutcome);
  revalidatePath("/", "layout");
  redirect("/");
}
