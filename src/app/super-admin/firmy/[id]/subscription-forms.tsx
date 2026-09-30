"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { ImplementationTier, ManagedCompany, SubscriptionTier } from "@/registry/registry";
import { changeImplementationTier, changeTier, setManualReadOnly, setPaidUntil, type SubscriptionFormState } from "../../actions";
import { ImplementationTierOptions, TierOptions } from "../../tier-options";

function FormResult({ state, pending, saved }: { state: SubscriptionFormState; pending: boolean; saved: string }) {
  return (
    <>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p role="status">{saved}</p>}
    </>
  );
}

export function TierForm({ company, tiers }: { company: ManagedCompany; tiers: SubscriptionTier[] }) {
  const [state, formAction, pending] = useActionState<SubscriptionFormState, FormData>(changeTier.bind(null, company.id), {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <div className="field">
        <label htmlFor="tier">{t("superAdmin.tier")}</label>
        <select id="tier" name="tier" defaultValue={company.tier.id} required>
          <TierOptions tiers={tiers} />
        </select>
      </div>
      <FormResult state={state} pending={pending} saved={t("superAdmin.tierSaved")} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("superAdmin.savingTier") : t("superAdmin.changeTier")}
        </button>
      </div>
    </form>
  );
}

export function ImplementationTierForm({ company, tiers }: { company: ManagedCompany; tiers: ImplementationTier[] }) {
  const [state, formAction, pending] = useActionState<SubscriptionFormState, FormData>(
    changeImplementationTier.bind(null, company.id),
    {},
  );
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <div className="field">
        <label htmlFor="implementationTier">{t("superAdmin.implementationTier")}</label>
        <select
          id="implementationTier"
          name="implementationTier"
          defaultValue={company.implementationTier.id}
          aria-describedby="implementationTier-hint"
          required
        >
          <ImplementationTierOptions tiers={tiers} />
        </select>
        <small id="implementationTier-hint">{t("superAdmin.implementationTierHint")}</small>
      </div>
      <FormResult state={state} pending={pending} saved={t("superAdmin.implementationTierSaved")} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("superAdmin.savingTier") : t("superAdmin.changeImplementationTier")}
        </button>
      </div>
    </form>
  );
}

export function PaidUntilForm({ company }: { company: ManagedCompany }) {
  const [state, formAction, pending] = useActionState<SubscriptionFormState, FormData>(setPaidUntil.bind(null, company.id), {});
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <div className="field">
        <label htmlFor="paidUntil">{t("superAdmin.paidUntil")}</label>
        <input
          id="paidUntil"
          name="paidUntil"
          type="date"
          defaultValue={company.paidUntil ?? undefined}
          aria-describedby="paidUntil-hint"
          required
        />
        <small id="paidUntil-hint">{t("superAdmin.paidUntilSectionHint")}</small>
      </div>
      <FormResult state={state} pending={pending} saved={t("superAdmin.paidUntilSaved")} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("superAdmin.savingPaidUntil") : t("superAdmin.setPaidUntil")}
        </button>
      </div>
    </form>
  );
}

export function ReadOnlyForm({ company }: { company: ManagedCompany }) {
  const [state, formAction, pending] = useActionState<SubscriptionFormState, FormData>(setManualReadOnly.bind(null, company.id), {});
  return (
    <form action={formAction} className="stack-form">
      <p>{company.manualReadOnly ? t("superAdmin.readOnlyOn") : t("superAdmin.readOnlyOff")}</p>
      <input type="hidden" name="manualReadOnly" value={company.manualReadOnly ? "off" : "on"} />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className={company.manualReadOnly ? "button" : "button button-danger"} type="submit" disabled={pending}>
          {pending
            ? t("superAdmin.switching")
            : company.manualReadOnly
              ? t("superAdmin.disableReadOnly")
              : t("superAdmin.enableReadOnly")}
        </button>
      </div>
    </form>
  );
}
