"use client";

import { type ReactNode, useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { closeSite, forceCloseSite, moveFromSite, type SiteClosingState } from "../../actions";

type Place = { id: string; name: string };

function FormError({ state }: { state: SiteClosingState }) {
  return (
    state.error && (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    )
  );
}

/** Zwrot jednego lub wszystkich pozostałych narzędzi na bazę. */
export function ReturnForm({
  siteId,
  baseId,
  toolIds,
  operationId,
  label,
}: {
  siteId: string;
  baseId: string;
  toolIds: string[];
  operationId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(moveFromSite.bind(null, siteId), {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} key={operationId}>
      <input type="hidden" name="kind" value="zwrot" />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="toLocationId" value={baseId} />
      {toolIds.map((toolId) => (
        <input key={toolId} type="hidden" name="toolId" value={toolId} />
      ))}
      <button className="button button-quiet button-small" type="submit" disabled={pending}>
        {pending ? t("siteClosing.moving") : label}
      </button>
      <FormError state={state} />
    </form>
  );
}

/** Przeniesienie narzędzia na inną aktywną budowę, na którą aktor może je zabrać. */
export function TransferForm({
  siteId,
  tool,
  sites,
  operationId,
}: {
  siteId: string;
  tool: { id: string; code: string };
  sites: Place[];
  operationId: string;
}) {
  const [state, formAction, pending] = useActionState(moveFromSite.bind(null, siteId), {});
  const selectId = `transfer-${tool.id}`;
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="site-manager-form" key={operationId}>
      <input type="hidden" name="kind" value="przeniesienie" />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="toolId" value={tool.id} />
      <div className="field">
        <label htmlFor={selectId}>{t("siteClosing.transferTo", { code: tool.code })}</label>
        <select id={selectId} name="toLocationId" defaultValue="" required>
          <option value="" disabled>
            {t("siteClosing.sitePlaceholder")}
          </option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-actions">
        <button className="button button-quiet button-small" type="submit" disabled={pending}>
          {pending ? t("siteClosing.moving") : t("siteClosing.transfer")}
        </button>
      </div>
      <FormError state={state} />
    </form>
  );
}

/** Zamknięcie pustej budowy, po potwierdzeniu. */
export function CloseSiteForm({ site }: { site: Place }) {
  const [state, formAction, pending] = useActionState(closeSite.bind(null, site.id), {});
  return (
    <ConfirmedForm
      formAction={formAction}
      pending={pending}
      state={state}
      label={t("siteClosing.submit")}
      question={t("siteClosing.confirm", { name: site.name })}
    />
  );
}

/** Wymuszone zamknięcie z powodem (tylko właściciel): pozostałe narzędzia będą zaginione. */
export function ForceCloseForm({ site, count, operationId }: { site: Place; count: number; operationId: string }) {
  const [state, formAction, pending] = useActionState(forceCloseSite.bind(null, site.id), {});
  return (
    <ConfirmedForm
      formAction={formAction}
      pending={pending}
      state={state}
      danger
      label={t("siteClosing.forceSubmit")}
      question={t("siteClosing.forceConfirm", { count, name: site.name })}
    >
      <input type="hidden" name="operationId" value={operationId} />
      <div className="field">
        <label htmlFor="force-reason">{t("siteClosing.reason")}</label>
        <input id="force-reason" name="reason" autoComplete="off" required placeholder={t("siteClosing.forceReasonPlaceholder")} />
      </div>
    </ConfirmedForm>
  );
}

/** Formularz, który przed wysłaniem pyta „na pewno?”. */
function ConfirmedForm({
  formAction,
  pending,
  state,
  label,
  question,
  danger = false,
  children,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: SiteClosingState;
  label: string;
  question: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        // Pierwsze wysłanie (także Enterem w polu powodu) tylko pyta o potwierdzenie.
        if (!confirming) {
          event.preventDefault();
          setConfirming(true);
          return;
        }
        setConfirming(false);
        submitKeepingValues(formAction)(event);
      }}
      className="stack-form"
    >
      {children}
      <FormError state={state} />
      {confirming ? (
        <div className="member-confirm">
          <p>{question}</p>
          <div className="form-actions">
            <button className={danger ? "button button-danger" : "button"} type="submit" disabled={pending}>
              {pending ? t("siteClosing.closing") : t("siteClosing.confirmYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("siteClosing.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className={danger ? "button button-quiet" : "button"} type="submit" disabled={pending}>
            {pending ? t("siteClosing.closing") : label}
          </button>
        </div>
      )}
    </form>
  );
}
