"use client";

import { useActionState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { Site, SiteManagerCandidate } from "@/registry/registry";
import { addService, addSite, type ChangeManagerState, type LocationFormState } from "./actions";

function FormError({ state }: { state: { error?: string } }) {
  return (
    state.error && (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    )
  );
}

function AddedNotice({ state, message }: { state: LocationFormState; message: (name: string) => string }) {
  return state.added && <p role="status">{message(state.added.name)}</p>;
}

function ManagerSelect({ id, managers, defaultValue }: { id: string; managers: SiteManagerCandidate[]; defaultValue: string }) {
  return (
    <select id={id} name="managerId" defaultValue={defaultValue} required>
      <option value="" disabled>
        {t("locations.managerPlaceholder")}
      </option>
      {managers.map((manager) => (
        <option key={manager.id} value={manager.id}>
          {manager.fullName}
        </option>
      ))}
    </select>
  );
}

export function AddSiteForm({ managers }: { managers: SiteManagerCandidate[] }) {
  const [state, formAction, pending] = useActionState(addSite, {});

  return (
    <div className="stack-form">
      <AddedNotice state={state} message={(name) => t("locations.siteAdded", { name })} />
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={state.added?.id}>
        <div className="field">
          <label htmlFor="site-name">{t("locations.siteName")}</label>
          <input id="site-name" name="name" autoComplete="off" required />
          <small>{t("locations.siteNameHint")}</small>
        </div>
        <div className="field">
          <label htmlFor="site-address">{t("locations.address")}</label>
          <input id="site-address" name="address" autoComplete="off" required />
        </div>
        <div className="field">
          <label htmlFor="site-manager">{t("locations.manager")}</label>
          <ManagerSelect id="site-manager" managers={managers} defaultValue="" />
        </div>
        <FormError state={state} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("locations.submitting") : t("locations.submitSite")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AddServiceForm() {
  const [state, formAction, pending] = useActionState(addService, {});

  return (
    <div className="stack-form">
      <AddedNotice state={state} message={(name) => t("locations.serviceAdded", { name })} />
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={state.added?.id}>
        <div className="field">
          <label htmlFor="service-name">{t("locations.serviceName")}</label>
          <input id="service-name" name="name" autoComplete="off" required />
          <small>{t("locations.serviceNameHint")}</small>
        </div>
        <FormError state={state} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("locations.submitting") : t("locations.submitService")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ChangeManagerForm({
  action,
  site,
  managers,
}: {
  action: (prev: ChangeManagerState, formData: FormData) => Promise<ChangeManagerState>;
  site: Site;
  managers: SiteManagerCandidate[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const selectId = `manager-${site.id}`;
  // Obecny kierownik bywa dezaktywowany: wtedy nie ma go na liście i trzeba wybrać nowego.
  const current = managers.some((manager) => manager.id === site.manager.id) ? site.manager.id : "";

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="site-manager-form">
      <div className="field">
        <label htmlFor={selectId}>{t("locations.newManager", { name: site.name })}</label>
        <ManagerSelect id={selectId} managers={managers} defaultValue={current} />
      </div>
      <div className="form-actions">
        <button className="button button-quiet" type="submit" disabled={pending}>
          {pending ? t("locations.changing") : t("locations.changeManager")}
        </button>
      </div>
      <FormError state={state} />
      {state.changed && !pending && <p role="status">{t("locations.managerChanged")}</p>}
    </form>
  );
}
