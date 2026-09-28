"use server";

import { refresh, revalidatePath } from "next/cache";
import { conflictText } from "@/i18n/movement-text";
import { t } from "@/i18n/t";
import { InterpretationFailedError } from "@/interpretation/interpretation";
import type { Proposal, ProposalKind, WhereAnswer } from "@/interpretation/proposal";
import { TranscriptionFailedError } from "@/interpretation/transcription";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getInterpretation } from "@/lib/interpretation-instance";
import type { QueuedMovement, SendOutcome, TranscribeOutcome } from "@/lib/offline/queue";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import { MovementConflictError, type RegisteredKind, type RegisteredMovement, type RegisterSource } from "@/registry/registry";

export interface ChecklistState {
  error?: string;
  /** Przy odrzuceniu z powodu zmienionego stanu: co i gdzie jest teraz. */
  conflicts?: string[];
  /**
   * Zapisany ruch: operacja, którą checklista, skaner albo propozycja właśnie zatwierdziły, ruch (do cofnięcia z komunikatu)
   * i kogo o nim powiadomiono.
   */
  done?: { operationId: string; movementId: string; notified: string[] };
}

export async function registerMovement(_prev: ChecklistState, formData: FormData): Promise<ChecklistState> {
  const session = await requireSession();
  return saveMovement(formData, (movement) =>
    getRegistry()
      .as(session.userId)
      .registerMovement({
        ...movement,
        kind: formText(formData, "kind") as RegisteredKind,
        source: formText(formData, "source") as RegisterSource,
      }),
  );
}

/** ✓ pod propozycją z wpisu tekstem: ruch przez moduł Interpretacja, ze źródłem `glos` i wpisanym tekstem. */
export async function confirmProposal(_prev: ChecklistState, formData: FormData): Promise<ChecklistState> {
  const session = await requireSession();
  return saveMovement(formData, (movement) =>
    getInterpretation()
      .as(session.userId)
      .confirm({
        ...movement,
        kind: formText(formData, "kind") as ProposalKind,
        text: formText(formData, "text"),
        // Propozycja z nagrania z kolejki offline: ruch zdarzył się w chwili nagrania.
        ...(formText(formData, "occurredAt") && { occurredAt: new Date(formText(formData, "occurredAt")) }),
      }),
  );
}

/** Zapisuje ruch z formularza; przy konflikcie stanu mówi, gdzie są teraz narzędzia, i odświeża stronę. */
async function saveMovement(
  formData: FormData,
  save: (movement: { operationId: string; fromLocationId: string; toLocationId: string; toolIds: string[] }) => Promise<RegisteredMovement>,
): Promise<ChecklistState> {
  const operationId = formText(formData, "operationId");
  let notified: string[];
  let movementId: string;
  try {
    const movement = await save({
      operationId,
      fromLocationId: formText(formData, "fromLocationId"),
      toLocationId: formText(formData, "toLocationId"),
      toolIds: formData.getAll("toolId").filter((id): id is string => typeof id === "string"),
    });
    notified = movement.notifications.map((notification) => notification.recipient.fullName);
    movementId = movement.id;
  } catch (error) {
    if (!(error instanceof MovementConflictError)) return { error: errorMessage(error) };
    // Checklista, skaner i propozycja pokażą od razu bieżący stan narzędzi.
    refresh();
    return {
      error: errorMessage(error),
      conflicts: error.conflicts.map(conflictText),
    };
  }
  revalidatePath("/");
  return { done: { operationId, movementId, notified } };
}

/** Propozycja ruchu z wpisanego zdania albo, na pytanie „gdzie jest …”, odpowiedź, gdzie jest sprzęt. Nic nie zapisuje. */
export async function proposeMovement(text: string): Promise<{ proposal?: Proposal; where?: WhereAnswer; error?: string }> {
  const session = await requireSession();
  try {
    const { proposal, where } = await getInterpretation().as(session.userId).reply(text);
    return { proposal, where };
  } catch (error) {
    if (!(error instanceof InterpretationFailedError)) return { error: errorMessage(error) };
    console.error(error);
    return { error: t("textEntry.failed") };
  }
}

/**
 * Propozycja ruchu (albo odpowiedź „gdzie jest …”) z nagrania: transkrypcja, a potem ta sama interpretacja co przy
 * wpisie tekstem. Nic nie zapisuje; nagranie znika z kubełka nagrań zaraz po transkrypcji. `text`: rozpoznany tekst,
 * także gdy interpretacja się nie udała, żeby kierownik mógł go poprawić i wysłać bez mówienia od nowa.
 */
export async function proposeFromRecording(
  formData: FormData,
): Promise<{ text?: string; proposal?: Proposal; where?: WhereAnswer; error?: string }> {
  const { text, proposal, where, error } = await hearRecording(formData);
  return { text, proposal, where, error };
}

/**
 * Nagranie z kolejki offline telefonu: jak `proposeFromRecording`, ale mówi telefonowi, czy nagranie może
 * już zniknąć (rozpoznane albo bez szans na rozpoznanie), czy ma poczekać na ponowienie (np. awaria dostawcy).
 * Pytanie „gdzie jest …” sprzed godzin nie ma już aktualnej odpowiedzi: telefon dostaje sam tekst do wysłania.
 */
export async function transcribeQueuedRecording(formData: FormData): Promise<TranscribeOutcome> {
  const { retry, text, proposal, error } = await hearRecording(formData);
  if (retry) return { status: "retry" };
  if (text !== undefined) return { status: "transcribed", text, ...(proposal && { proposal }), ...(error && { error }) };
  return { status: "discarded", error: error ?? t("voice.failed") };
}

/** `retry`: nagranie nie zostało rozpoznane z powodu, który może minąć (dostawca transkrypcji, kubełek, awaria). */
async function hearRecording(
  formData: FormData,
): Promise<{ text?: string; proposal?: Proposal; where?: WhereAnswer; error?: string; retry: boolean }> {
  const session = await requireSession();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) return { error: t("voice.invalid"), retry: false };
  try {
    const { text, proposal, where } = await getInterpretation().as(session.userId).replyToRecording(audio);
    return { text, proposal, where, retry: false };
  } catch (error) {
    if (error instanceof TranscriptionFailedError) {
      if (error.reason === "silence") return { error: t("voice.silence"), retry: false };
      console.error(error);
      return { error: t("voice.failed"), retry: true };
    }
    if (error instanceof InterpretationFailedError) {
      console.error(error);
      return { text: error.text, error: t("textEntry.failed"), retry: false };
    }
    if (isRegistryError(error)) {
      return error.code === "invalid_input" ? { error: t("voice.invalid"), retry: false } : { error: errorMessage(error), retry: true };
    }
    // Kubełek nagrań albo nieoczekiwana awaria: nagranie można powtórzyć.
    console.error(error);
    return { error: t("voice.failed"), retry: true };
  }
}

/**
 * Ruch z kolejki offline telefonu, z czasem zdarzenia z chwili zapisu. Odrzucony trafia na listę
 * „Do wyjaśnienia” i do dzwonka; przy błędzie, po którym warto ponowić, ruch zostaje w kolejce.
 */
export async function sendQueuedMovement(item: QueuedMovement): Promise<SendOutcome> {
  const session = await requireSession();
  // Na wspólnym telefonie ruch innej osoby czeka, aż ona się zaloguje.
  if (item.userId !== session.userId) return "retry";
  try {
    const result = await getRegistry()
      .as(session.userId)
      .registerQueuedMovement({
        operationId: item.operationId,
        kind: item.kind,
        fromLocationId: item.fromLocationId,
        toLocationId: item.toLocationId,
        toolIds: item.toolIds,
        source: item.source,
        transcript: item.transcript,
        occurredAt: new Date(item.occurredAt),
      });
    revalidatePath("/", "layout");
    return result.status;
  } catch (error) {
    console.error("Ruch z kolejki offline czeka na ponowienie", error);
    return "retry";
  }
}

export async function undoMovement(movementId: string, operationId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).undoMovement({ operationId, movementId });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  return {};
}
