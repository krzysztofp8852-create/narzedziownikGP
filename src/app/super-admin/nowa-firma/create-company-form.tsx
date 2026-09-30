"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TemporaryPassword } from "@/components/temporary-password";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { ImplementationTier, SubscriptionTier } from "@/registry/registry";
import { createCompany } from "../actions";
import { ImplementationTierOptions, TierOptions } from "../tier-options";

export function CreateCompanyForm({
  tiers,
  implementationTiers,
  defaultBaseName,
}: {
  tiers: SubscriptionTier[];
  implementationTiers: ImplementationTier[];
  defaultBaseName: string;
}) {
  const [state, formAction, pending] = useActionState(createCompany, {});

  return (
    <div className="stack-form">
      {state.created && (
        <>
          <TemporaryPassword
            title={t("superAdmin.created", { company: state.created.name, email: state.created.ownerEmail })}
            password={state.created.temporaryPassword}
          />
          <p>
            <Link href={`/super-admin/firmy/${state.created.companyId}`}>{t("superAdmin.openCompany")}</Link>
          </p>
        </>
      )}
      <form onSubmit={submitKeepingValues(formAction)} className="company-grid" key={state.created?.companyId}>
        <div className="company-card" role="group" aria-labelledby="group-company">
          <h2 id="group-company" className="display section-title">
            {t("superAdmin.sectionCompany")}
          </h2>
          <div className="field">
            <label htmlFor="name">{t("superAdmin.companyName")}</label>
            <input id="name" name="name" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="baseName">{t("superAdmin.baseName")}</label>
            <input id="baseName" name="baseName" autoComplete="off" defaultValue={defaultBaseName} required />
          </div>
        </div>
        <div className="company-card" role="group" aria-labelledby="group-invoice">
          <h2 id="group-invoice" className="display section-title">
            {t("superAdmin.sectionInvoice")}
          </h2>
          <div className="field">
            <label htmlFor="invoiceName">{t("superAdmin.invoiceName")}</label>
            <input id="invoiceName" name="invoiceName" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="taxId">{t("superAdmin.taxId")}</label>
            <input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="invoiceAddress">{t("superAdmin.invoiceAddress")}</label>
            <textarea id="invoiceAddress" name="invoiceAddress" rows={3} autoComplete="off" required />
          </div>
        </div>
        <div className="company-card" role="group" aria-labelledby="group-subscription">
          <h2 id="group-subscription" className="display section-title">
            {t("superAdmin.sectionSubscription")}
          </h2>
          <div className="field">
            <label htmlFor="tier">{t("superAdmin.tier")}</label>
            <select id="tier" name="tier" defaultValue={tiers[0].id} required>
              <TierOptions tiers={tiers} />
            </select>
          </div>
          <div className="field">
            <label htmlFor="implementationTier">{t("superAdmin.implementationTier")}</label>
            <select
              id="implementationTier"
              name="implementationTier"
              defaultValue={implementationTiers[0].id}
              aria-describedby="implementationTier-hint"
              required
            >
              <ImplementationTierOptions tiers={implementationTiers} />
            </select>
            <small id="implementationTier-hint">{t("superAdmin.implementationTierHint")}</small>
          </div>
          <div className="field">
            <label htmlFor="paidUntil">{t("superAdmin.paidUntil")}</label>
            <input id="paidUntil" name="paidUntil" type="date" aria-describedby="paidUntil-hint" />
            <small id="paidUntil-hint">{t("superAdmin.paidUntilHint")}</small>
          </div>
        </div>
        <div className="company-card" role="group" aria-labelledby="group-owner">
          <h2 id="group-owner" className="display section-title">
            {t("superAdmin.sectionOwner")}
          </h2>
          <div className="field">
            <label htmlFor="ownerName">{t("superAdmin.ownerName")}</label>
            <input id="ownerName" name="ownerName" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="ownerEmail">{t("superAdmin.ownerEmail")}</label>
            <input id="ownerEmail" name="ownerEmail" type="email" autoComplete="off" required />
          </div>
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" type="submit" disabled={pending}>
              {pending ? t("superAdmin.creating") : t("superAdmin.submitCreate")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
