"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { newOperationId } from "@/lib/operation-id";
import { closeIssue, commentOnIssue, type IssueThreadFormState } from "../actions";

/** Komentarz pod zgłoszeniem; po zapisie pusty formularz z nową operacją pod następny. */
export function CommentForm({ issueId, operationId: initial, maxLength }: { issueId: string; operationId: string; maxLength: number }) {
  const [operationId, setOperationId] = useState(initial);
  return (
    <CommentFields key={operationId} issueId={issueId} operationId={operationId} maxLength={maxLength} onDone={() => setOperationId(newOperationId())} />
  );
}

function CommentFields({ issueId, operationId, maxLength, onDone }: { issueId: string; operationId: string; maxLength: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: IssueThreadFormState, formData: FormData) => {
    const result = await commentOnIssue(issueId, prev, formData);
    if (result.done) onDone();
    return result;
  }, {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <input type="hidden" name="operationId" value={operationId} />
      <div className="field">
        <label htmlFor="issue-comment">{t("issues.comment.label")}</label>
        <textarea
          id="issue-comment"
          name="text"
          rows={3}
          maxLength={maxLength}
          placeholder={t("issues.comment.placeholder")}
          required
        />
      </div>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("issues.comment.submitting") : t("issues.comment.submit")}
        </button>
      </div>
    </form>
  );
}

/** Zamknięcie komentarzem; właściciel przy uszkodzeniu może od razu uznać narzędzie za sprawne. */
export function CloseIssueForm({
  issueId,
  operationId,
  canMarkToolWorking,
  maxLength,
}: {
  issueId: string;
  operationId: string;
  canMarkToolWorking: boolean;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(closeIssue.bind(null, issueId), {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <input type="hidden" name="operationId" value={operationId} />
      <div className="field">
        <label htmlFor="issue-close-comment">{t("issues.close.label")}</label>
        <textarea
          id="issue-close-comment"
          name="comment"
          rows={3}
          maxLength={maxLength}
          placeholder={t("issues.close.placeholder")}
          required
        />
      </div>
      {canMarkToolWorking && (
        <label className="checkbox">
          <input type="checkbox" name="toolWorking" /> {t("issues.close.toolWorking")}
        </label>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("issues.close.submitting") : t("issues.close.submit")}
        </button>
      </div>
    </form>
  );
}
