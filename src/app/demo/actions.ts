"use server";

import { redirect } from "next/navigation";
import { type DemoRole, isDemoRole } from "@/demo/company";
import { signInToDemo } from "@/lib/demo-sign-in";
import { formText } from "@/lib/forms";
import { demoReturnPath } from "@/lib/next-path";

/**
 * Wejście do firmy demo w wybranej roli (strona /demo i pasek demo w aplikacji), bez hasła. Z paska oglądający
 * zostaje na bieżącej stronie (`wroc`), jeśli widzi ją każda rola.
 */
export async function enterDemo(formData: FormData) {
  const role = formData.get("role");
  if (!isDemoRole(role) || !(await signedInToDemo(role))) redirect("/demo?niedostepne=1");
  redirect(demoReturnPath(formText(formData, "wroc")));
}

/** Błąd logowania jednorazowym linkiem (np. chwilowa awaria Supabase) to niedostępne demo, a nie strona błędu. */
async function signedInToDemo(role: DemoRole): Promise<boolean> {
  try {
    return await signInToDemo(role);
  } catch (error) {
    console.error(`Nie udało się wejść do demo jako ${role}`, error);
    return false;
  }
}
