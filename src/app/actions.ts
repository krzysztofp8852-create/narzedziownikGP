"use server";

import { redirect } from "next/navigation";
import { signOutThisBrowser } from "@/lib/auth";

/** Wylogowanie tej przeglądarki; konto demo wraca na stronę wyboru roli. */
export async function signOut() {
  const { demo } = await signOutThisBrowser();
  redirect(demo ? "/demo" : "/logowanie");
}
