"use client";

import { type FormEvent, startTransition, useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { newOperationId } from "@/lib/operation-id";
import { withShrunkPhoto } from "@/lib/shrink-photo";

export interface ChatFormState {
  error?: string;
  /** Wysłane; formularz czyści się pod następną wiadomość. */
  done?: boolean;
}

export interface ChatMessageFormProps {
  action: (prev: ChatFormState, formData: FormData) => Promise<ChatFormState>;
  operationId: string;
  /** Ukryte pola wysyłane z każdą wiadomością, np. ekran i wersja aplikacji. */
  hidden?: Record<string, string>;
  label: string;
  placeholder: string;
  submit: string;
  maxLength: number;
}

/** Wiadomość na czacie z tekstem i (albo) zdjęciem; po wysłaniu pusty formularz z nową operacją pod następną. */
export function ChatMessageForm({ operationId: initial, ...props }: ChatMessageFormProps) {
  const [operationId, setOperationId] = useState(initial);
  return <ChatMessageFields key={operationId} {...props} operationId={operationId} onDone={() => setOperationId(newOperationId())} />;
}

function ChatMessageFields({
  action,
  operationId,
  hidden = {},
  label,
  placeholder,
  submit,
  maxLength,
  onDone,
}: ChatMessageFormProps & { onDone: () => void }) {
  const [preparing, setPreparing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ChatFormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.done) onDone();
    return result;
  }, {});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = await withShrunkPhoto(new FormData(event.currentTarget), setPreparing);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={onSubmit} className="stack-form chat-form" id="napisz">
      <input type="hidden" name="operationId" value={operationId} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="field">
        <label htmlFor="chat-text">{label}</label>
        <textarea id="chat-text" name="text" rows={3} maxLength={maxLength} placeholder={placeholder} />
      </div>
      <div className="field">
        <label htmlFor="chat-photo">{t("supportChat.form.photo")}</label>
        <input id="chat-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" aria-describedby="chat-photo-hint" />
        <small id="chat-photo-hint">{t("supportChat.form.photoHint")}</small>
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending || preparing}>
          {preparing ? t("supportChat.form.photoPreparing") : pending ? t("supportChat.form.submitting") : submit}
        </button>
      </div>
    </form>
  );
}
