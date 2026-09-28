"use server";

import { t } from "@/i18n/t";
import { InterpretationFailedError } from "@/interpretation/interpretation";
import type { WhereAnswer } from "@/interpretation/proposal";
import { TranscriptionFailedError } from "@/interpretation/transcription";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getInterpretation } from "@/lib/interpretation-instance";
import { isRegistryError } from "@/registry/errors";

/**
 * Wyszukiwanie głosem („gdzie jest niwelator?”): transkrypcja i interpretacja, a w wyniku narzędzia, o które pytano.
 * Każda rola. Nic nie zapisuje; nagranie znika z kubełka zaraz po transkrypcji.
 */
export async function findByVoice(formData: FormData): Promise<{ answer?: WhereAnswer; error?: string }> {
  const session = await requireSession();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) return { error: t("voice.invalid") };
  try {
    return { answer: await getInterpretation().as(session.userId).findFromRecording(audio) };
  } catch (error) {
    if (error instanceof TranscriptionFailedError) {
      if (error.reason === "silence") return { error: t("search.silence") };
      console.error(error);
      return { error: t("voice.failed") };
    }
    if (error instanceof InterpretationFailedError) {
      console.error(error);
      return { error: error.text ? t("search.failedHeard", { text: error.text }) : t("search.failed") };
    }
    if (isRegistryError(error) && error.code === "invalid_input") return { error: t("voice.invalid") };
    return { error: errorMessage(error) };
  }
}
