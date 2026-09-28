"use server";

import { redirect } from "next/navigation";
import { isDemoRole } from "@/demo/company";
import { signInToDemo } from "@/lib/demo-sign-in";

/** Wejście do firmy demo w wybranej roli (strona /demo i pasek demo w aplikacji), bez hasła. */
export async function enterDemo(formData: FormData) {
  const role = formData.get("role");
  if (!isDemoRole(role) || !(await signInToDemo(role))) redirect("/demo?niedostepne=1");
  redirect("/");
}
