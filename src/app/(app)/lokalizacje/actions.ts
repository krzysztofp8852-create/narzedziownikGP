"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";

export interface LocationFormState {
  error?: string;
  /** Dodana lokalizacja; po dodaniu formularz się czyści. */
  added?: { id: string; name: string };
}

export interface ChangeManagerState {
  error?: string;
  changed?: boolean;
}

export async function addSite(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const session = await requireSession();
  try {
    const name = formText(formData, "name");
    const { locationId } = await getRegistry()
      .as(session.userId)
      .addSite({ name, address: formText(formData, "address"), managerId: formText(formData, "managerId") });
    revalidatePath("/");
    return { added: { id: locationId, name: name.trim() } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function addService(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const session = await requireSession();
  try {
    const name = formText(formData, "name");
    const { locationId } = await getRegistry().as(session.userId).addService({ name });
    revalidatePath("/");
    return { added: { id: locationId, name: name.trim() } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function changeSiteManager(siteId: string, _prev: ChangeManagerState, formData: FormData): Promise<ChangeManagerState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).changeSiteManager(siteId, formText(formData, "managerId"));
    revalidatePath("/");
    return { changed: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
