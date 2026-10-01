"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import { newOperationId } from "@/lib/operation-id";
import { type Category, MAX_RENTAL_COMPANY_LENGTH } from "@/registry/registry";
import { addRentedTool, type RentedToolFormState } from "./actions";

type Place = { id: string; name: string };

export interface RentedToolFormProps {
  categories: Category[];
  /** Miejsca, w których aktor przyjmuje sprzęt wynajęty: baza (właściciel, magazynier), aktywne budowy i pojazdy. */
  places: { base: Place | null; sites: Place[]; vehicles: Place[] };
  /** Pole wartości: tylko właściciel. */
  showValue: boolean;
  operationId: string;
}

/** Przyjęcie sprzętu z wypożyczalni tam, gdzie stoi; po zapisie pusty formularz pod następny. */
export function RentedToolForm(props: RentedToolFormProps) {
  const [operationId, setOperationId] = useState(props.operationId);
  const [added, setAdded] = useState<RentedToolFormState["added"]>();
  const { base, sites, vehicles } = props.places;

  if (!base && sites.length === 0 && vehicles.length === 0) return <p className="empty">{t("rentals.noPlaces")}</p>;
  if (props.categories.length === 0) return <p className="empty">{t("rentals.noCategories")}</p>;

  return (
    <div className="stack-form">
      {added && (
        <p role="status" className="checklist-done">
          {t("rentals.added", { code: added.code, name: added.name, place: added.place })}{" "}
          <Link href={`/narzedzia/${added.id}`}>{t("tools.openCard")}</Link>
        </p>
      )}
      <Fields
        key={operationId}
        {...props}
        operationId={operationId}
        onAdded={(tool) => {
          setAdded(tool);
          setOperationId(newOperationId());
        }}
      />
    </div>
  );
}

function Fields({
  categories,
  places,
  showValue,
  operationId,
  onAdded,
}: RentedToolFormProps & { onAdded: (tool: NonNullable<RentedToolFormState["added"]>) => void }) {
  const all = [...(places.base ? [places.base] : []), ...places.sites, ...places.vehicles];
  const [locationId, setLocationId] = useState(all.length === 1 ? all[0].id : "");
  const [state, formAction, pending] = useActionState(async (prev: RentedToolFormState, formData: FormData) => {
    const result = await addRentedTool(prev, formData);
    if (result.added) onAdded(result.added);
    return result;
  }, {});

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="placeName" value={all.find((place) => place.id === locationId)?.name ?? ""} />
      <p className="muted">{t("rentals.intro")}</p>
      <div className="field">
        <label htmlFor="rented-place">{t("rentals.place")}</label>
        <select id="rented-place" name="locationId" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
          <option value="" disabled>
            {t("rentals.placePlaceholder")}
          </option>
          {places.base && (
            <optgroup label={t("rentals.baseGroup")}>
              <option value={places.base.id}>{places.base.name}</option>
            </optgroup>
          )}
          {places.sites.length > 0 && (
            <optgroup label={t("rentals.sitesGroup")}>
              {places.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </optgroup>
          )}
          {places.vehicles.length > 0 && (
            <optgroup label={t("rentals.vehiclesGroup")}>
              {places.vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rented-category">{t("tools.category")}</label>
        <select id="rented-category" name="categoryId" defaultValue="" required>
          <option value="" disabled>
            {t("tools.categoryPlaceholder")}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rented-name">{t("tools.name")}</label>
        <input id="rented-name" name="name" required />
      </div>
      <div className="field">
        <label htmlFor="rented-company">{t("rentals.company")}</label>
        <input id="rented-company" name="rentalCompany" required maxLength={MAX_RENTAL_COMPANY_LENGTH} placeholder={t("rentals.companyPlaceholder")} />
      </div>
      <div className="field">
        <label htmlFor="rented-rate">{t("rentals.dailyRate")}</label>
        <input id="rented-rate" name="dailyRate" inputMode="decimal" required aria-describedby="rented-rate-hint" />
        <small id="rented-rate-hint">{t("rentals.dailyRateHint")}</small>
      </div>
      <div className="field">
        <label htmlFor="rented-return">{t("rentals.returnOn")}</label>
        <input id="rented-return" name="returnOn" type="date" required />
      </div>
      {showValue && (
        <div className="field">
          <label htmlFor="rented-value">{t("rentals.value")}</label>
          <input id="rented-value" name="value" inputMode="decimal" />
        </div>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? t("rentals.submitting") : t("rentals.submit")}
        </button>
      </div>
    </form>
  );
}
