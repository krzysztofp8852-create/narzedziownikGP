"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type DemoRole, isDemoRole } from "@/demo/company";
import { currentSessionId, currentUserId } from "@/lib/auth";
import { demoDevice } from "@/lib/demo-device";
import { signInToDemo } from "@/lib/demo-sign-in";
import { formText } from "@/lib/forms";
import { demoReturnPath } from "@/lib/next-path";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Wejście do firmy demo w wybranej roli (strona /demo i pasek demo w aplikacji), bez hasła. Z paska oglądający
 * zostaje na bieżącej stronie (`wroc`), jeśli widzi ją każda rola. Wejście trafia do dziennika demo.
 */
export async function enterDemo(formData: FormData) {
  const role = formData.get("role");
  if (!isDemoRole(role)) redirect("/demo?niedostepne=1");
  const back = formText(formData, "wroc");
  // Sesja sprzed wejścia łączy przełączenie roli z tą samą wizytą.
  const previousSessionId = await currentSessionId();
  const device = demoDevice((await headers()).get("user-agent"));
  const entered = await signedInToDemo(role);
  if (!entered) redirect("/demo?niedostepne=1");
  await logged("wejścia", () =>
    getRegistry()
      .system()
      .recordDemoEntry({ ...entered, previousSessionId, switched: back !== "", device }),
  );
  redirect(demoReturnPath(back));
}

/** Ekran otwarty w firmie demo (`DemoPageLog`), do dziennika demo. Poza obecnym demo Rejestr nic nie zapisze. */
export async function recordDemoPage(path: string) {
  const userId = await currentUserId();
  if (!userId || typeof path !== "string") return;
  const sessionId = await currentSessionId();
  await logged("ekranu", () => getRegistry().system().recordDemoPage({ userId, sessionId, path }));
}

/** Błąd logowania jednorazowym linkiem (np. chwilowa awaria Supabase) to niedostępne demo, a nie strona błędu. */
async function signedInToDemo(role: DemoRole) {
  try {
    return await signInToDemo(role);
  } catch (error) {
    console.error(`Nie udało się wejść do demo jako ${role}`, error);
    return null;
  }
}

/** Dziennik demo nie może zablokować oglądania: błąd zapisu tylko trafia do logów. */
async function logged(what: string, record: () => Promise<void>) {
  try {
    await record();
  } catch (error) {
    console.error(`Nie zapisano ${what} w dzienniku demo`, error);
  }
}
