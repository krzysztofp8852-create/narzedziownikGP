"use client";

import { useActionState, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { SiteManagerCandidate, Vehicle } from "@/registry/registry";
import {
  addService,
  addSite,
  addVehicle,
  type ChangeManagerState,
  deactivateVehicle,
  type LocationFormState,
  setVehicleAlarm,
  type VehicleActionState,
} from "./actions";

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
          {manager.role === "wlasciciel" ? t("locations.ownerAsManager", { name: manager.fullName }) : manager.fullName}
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

export function AddVehicleForm({ managers }: { managers: SiteManagerCandidate[] }) {
  const [state, formAction, pending] = useActionState(addVehicle, {});

  return (
    <div className="stack-form">
      <AddedNotice state={state} message={(name) => t("locations.vehicleAdded", { name })} />
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form" key={state.added?.id}>
        <div className="field">
          <label htmlFor="vehicle-name">{t("locations.vehicleName")}</label>
          <input id="vehicle-name" name="name" autoComplete="off" required />
          <small>{t("locations.vehicleNameHint")}</small>
        </div>
        <div className="field">
          <label htmlFor="vehicle-manager">{t("locations.manager")}</label>
          <ManagerSelect id="vehicle-manager" managers={managers} defaultValue="" />
        </div>
        <FormError state={state} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("locations.submitting") : t("locations.submitVehicle")}
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

/** Zmiana kierownika budowy albo pojazdu; `label` nazywa pole („Nowy kierownik budowy Rataje”). */
export function ChangeManagerForm({
  action,
  location,
  label,
  managers,
}: {
  action: (prev: ChangeManagerState, formData: FormData) => Promise<ChangeManagerState>;
  location: { id: string; manager: { id: string } };
  label: string;
  managers: SiteManagerCandidate[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const selectId = `manager-${location.id}`;
  // Obecny kierownik bywa dezaktywowany: wtedy nie ma go na liście i trzeba wybrać nowego.
  const current = managers.some((manager) => manager.id === location.manager.id) ? location.manager.id : "";

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="site-manager-form">
      <div className="field">
        <label htmlFor={selectId}>{label}</label>
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

/** Właściciel włącza albo wyłącza alarm po progu dni dla pojazdu (domyślnie wyłączony). */
export function VehicleAlarmForm({ vehicle }: { vehicle: Pick<Vehicle, "id" | "alarmEnabled"> }) {
  const [state, setState] = useState<VehicleActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack-form">
      <p>{vehicle.alarmEnabled ? t("locations.alarmOn") : t("locations.alarmOff")}</p>
      <small className="muted">{t("locations.vehicleAlarmHint")}</small>
      <div className="form-actions">
        <button
          className="button button-quiet button-small"
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await setVehicleAlarm(vehicle.id, !vehicle.alarmEnabled)))}
        >
          {pending ? t("locations.changing") : vehicle.alarmEnabled ? t("locations.disableAlarm") : t("locations.enableAlarm")}
        </button>
      </div>
      <FormError state={state} />
    </div>
  );
}

/** Dezaktywacja pustego pojazdu, z potwierdzeniem; z narzędziami na pokładzie tylko wyjaśnia, czemu się nie da. */
export function DeactivateVehicleForm({ vehicle, empty }: { vehicle: Pick<Vehicle, "id" | "name">; empty: boolean }) {
  const [state, setState] = useState<VehicleActionState>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!empty) return <p className="muted">{t("locations.deactivateEmptyOnly")}</p>;
  return (
    <div className="stack-form">
      <small className="muted">{t("locations.deactivateHint")}</small>
      {confirming ? (
        <div className="member-confirm">
          <p>{t("locations.deactivateConfirm", { name: vehicle.name })}</p>
          <div className="form-actions">
            <button
              className="button button-danger"
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setState(await deactivateVehicle(vehicle.id));
                  setConfirming(false);
                })
              }
            >
              {pending ? t("locations.deactivating") : t("locations.deactivateYes")}
            </button>
            <button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              {t("locations.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button button-quiet button-small" type="button" onClick={() => setConfirming(true)}>
            {t("locations.deactivateVehicle")}
          </button>
        </div>
      )}
      <FormError state={state} />
    </div>
  );
}
