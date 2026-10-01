"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { AddedMember, MemberRole } from "@/registry/registry";

export interface AddMemberState {
  error?: string;
  /** Hasło tymczasowe do przekazania osobiście; pokazujemy je tylko raz. */
  added?: AddedMember;
}

export interface MemberActionState {
  error?: string;
  temporaryPassword?: string;
}

export interface PersonFormState {
  error?: string;
  /** Zapis się udał; przy dopisaniu formularz czyści się nowym kluczem. */
  savedAt?: number;
}

/** Po zmianie w kartotece: lista Ludzie, tablica i abonament w ustawieniach (wykorzystanie pakietu wdrożenia). */
function revalidatePeople() {
  revalidatePath("/");
  revalidatePath("/ludzie");
  revalidatePath("/ustawienia");
}

/**
 * Konto z hasłem tymczasowym: dla osoby z kartoteki (pole `personId`) albo dla nowej osoby (imię i nazwisko z formularza).
 */
export async function addMember(_prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const session = await requireSession();
  const personId = formText(formData, "personId");
  const account = {
    email: formText(formData, "email"),
    username: formText(formData, "username"),
    role: formText(formData, "role") as MemberRole,
  };
  try {
    const registry = getRegistry().as(session.userId);
    const added = personId
      ? await registry.addPersonAccount({ personId, ...account })
      : await registry.addMember({ firstName: formText(formData, "firstName"), lastName: formText(formData, "lastName"), ...account });
    revalidatePeople();
    return { added };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function addPerson(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .addPerson({ fullName: formText(formData, "fullName"), note: formText(formData, "note") });
    revalidatePeople();
    return { savedAt: Date.now() };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function editPerson(personId: string, _prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .editPerson(personId, { fullName: formText(formData, "fullName"), note: formText(formData, "note") });
    revalidatePeople();
    return { savedAt: Date.now() };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deactivatePerson(personId: string): Promise<MemberActionState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).deactivatePerson(personId);
    revalidatePeople();
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function resetMemberPassword(memberId: string): Promise<MemberActionState> {
  const session = await requireSession();
  try {
    const { temporaryPassword } = await getRegistry().as(session.userId).resetMemberPassword(memberId);
    revalidatePeople();
    return { temporaryPassword };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deactivateMember(memberId: string): Promise<MemberActionState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).deactivateMember(memberId);
    revalidatePeople();
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
