"use server";

import { revalidatePath } from "next/cache";
import type { ChatFormState } from "@/components/chat-message-form";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formPhoto, formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";

/** Wiadomość do supportu z okna 💬, z ekranem i wersją aplikacji, z których pisze. */
export async function sendSupportMessage(_prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .sendSupportMessage({
        operationId: formText(formData, "operationId"),
        text: formText(formData, "text"),
        photo: formPhoto(formData),
        screen: formText(formData, "screen") || null,
        appVersion: formText(formData, "appVersion") || null,
      });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { done: true };
}
