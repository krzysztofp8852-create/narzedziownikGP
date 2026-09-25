"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import type { MemberRole } from "@/registry/registry";

export interface AddMemberState {
  error?: string;
  /** Hasło tymczasowe do przekazania osobiście; pokazujemy je tylko raz. */
  added?: { userId: string; fullName: string; email: string; temporaryPassword: string };
}

export interface MemberActionState {
  error?: string;
  temporaryPassword?: string;
}

export async function addMember(_prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const session = await requireSession();
  try {
    const added = await getRegistry()
      .as(session.userId)
      .addMember({
        firstName: text(formData, "firstName"),
        lastName: text(formData, "lastName"),
        email: text(formData, "email"),
        role: text(formData, "role") as MemberRole,
      });
    revalidatePath("/zespol");
    return { added };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function resetMemberPassword(memberId: string): Promise<MemberActionState> {
  const session = await requireSession();
  try {
    const { temporaryPassword } = await getRegistry().as(session.userId).resetMemberPassword(memberId);
    revalidatePath("/zespol");
    return { temporaryPassword };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deactivateMember(memberId: string): Promise<MemberActionState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).deactivateMember(memberId);
    revalidatePath("/zespol");
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
