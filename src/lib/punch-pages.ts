import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Po zapisie odbicia, wyjaśnieniu, nowym kodzie albo promieniu: zakładki „Ludzie” budów i bazy, lista do wyjaśnienia
 * i czas na budowie.
 */
export function revalidatePunchPages() {
  revalidatePath("/budowy/[id]/ludzie", "page");
  revalidatePath("/baza/ludzie");
  revalidatePath("/odbicia");
  revalidatePath("/czas");
}
