"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TemporaryPassword } from "@/components/temporary-password";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { SubscriptionTier } from "@/registry/registry";
import { createCompany } from "../actions";
import { TierOptions } from "../tier-options";

export function CreateCompanyForm({ tiers, defaultBaseName }: { tiers: SubscriptionTier[]; defaultBaseName: string }) {
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
        <fieldset className="company-card">
          <legend className="display section-title">{t("superAdmin.sectionCompany")}</legend>
          <div className="field">
            <label htmlFor="name">{t("superAdmin.companyName")}</label>
            <input id="name" name="name" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="baseName">{t("superAdmin.baseName")}</label>
            <input id="baseName" name="baseName" autoComplete="off" defaultValue={defaultBaseName} required />
          </div>
        </fieldset>
        <fieldset className="company-card">
          <legend className="display section-title">{t("superAdmin.sectionInvoice")}</legend>
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
        </fieldset>
        <fieldset className="company-card">
          <legend className="display section-title">{t("superAdmin.sectionSubscription")}</legend>
          <div className="field">
            <label htmlFor="tier">{t("superAdmin.tier")}</label>
            <select id="tier" name="tier" defaultValue={tiers[0].id} required>
              <TierOptions tiers={tiers} />
            </select>
          </div>
          <div className="field">
            <label htmlFor="paidUntil">{t("superAdmin.paidUntil")}</label>
            <input id="paidUntil" name="paidUntil" type="date" aria-describedby="paidUntil-hint" />
            <small id="paidUntil-hint">{t("superAdmin.paidUntilHint")}</small>
          </div>
        </fieldset>
        <fieldset className="company-card">
          <legend className="display section-title">{t("superAdmin.sectionOwner")}</legend>
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
        </fieldset>
      </form>
    </div>
  );
}
