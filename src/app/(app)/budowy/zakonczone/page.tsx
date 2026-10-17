import { redirect } from "next/navigation";
import { FINISHED_SITES_HREF } from "@/lib/sites-view";

/** Zakończone budowy są teraz na stronie Budowy; dawny adres (zakładki, stare odnośniki) prowadzi tam. */
export default function FinishedSitesPage() {
  redirect(FINISHED_SITES_HREF);
}
