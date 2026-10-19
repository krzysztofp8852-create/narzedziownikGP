import { revalidatePath } from "next/cache";

/** Budowę widać na tablicy, na stronie Budowy i na jej własnych stronach. */
export function revalidateSites() {
  revalidatePath("/");
  revalidatePath("/budowy", "layout");
}
