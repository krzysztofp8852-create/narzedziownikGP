import { redirect } from "next/navigation";
import { ACCOUNT_HREF } from "@/lib/nav-path";

/** Dawna strona Język (zakładki, stare linki): język jest teraz w Moim koncie. */
export default function LanguagePage() {
  redirect(ACCOUNT_HREF);
}
