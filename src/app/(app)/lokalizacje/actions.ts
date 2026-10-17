"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { settingsHref } from "@/lib/settings-pages";
import type { MapPosition } from "@/registry/registry";
import { revalidateSites } from "./revalidate-sites";

export interface LocationFormState {
  error?: string;
  /** Dodana lokalizacja; po dodaniu formularz się czyści. */
  added?: { id: string; name: string };
}

export interface ChangeManagerState {
  error?: string;
  changed?: boolean;
}

export interface VehicleActionState {
  error?: string;
}

export async function addSite(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const session = await requireSession();
  try {
    const name = formText(formData, "name");
    const { locationId } = await getRegistry()
      .as(session.userId)
      .addSite({ name, address: formText(formData, "address"), managerId: formText(formData, "managerId") });
    revalidateSites();
    return { added: { id: locationId, name: name.trim() } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function addService(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const session = await requireSession();
  try {
    const name = formText(formData, "name");
    const { locationId } = await getRegistry().as(session.userId).addService({ name });
    revalidatePath(settingsHref("sprzet"));
    return { added: { id: locationId, name: name.trim() } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Pojazd widać na tablicy, na stronie Pojazdy i na jego własnych stronach. */
function revalidateVehicles() {
  revalidatePath("/");
  revalidatePath("/pojazdy", "layout");
}

export async function addVehicle(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const session = await requireSession();
  try {
    const name = formText(formData, "name");
    const { locationId } = await getRegistry()
      .as(session.userId)
      .addVehicle({
        name,
        managerId: formText(formData, "managerId"),
        registrationNumber: formText(formData, "registrationNumber"),
        vin: formText(formData, "vin"),
      });
    revalidateVehicles();
    return { added: { id: locationId, name: name.trim() } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export interface VehicleDataState {
  error?: string;
  saved?: boolean;
}

/** Numer rejestracyjny i VIN z zakładki „Dane i terminy” pojazdu. */
export async function changeVehicleData(vehicleId: string, _prev: VehicleDataState, formData: FormData): Promise<VehicleDataState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .changeVehicleData(vehicleId, { registrationNumber: formText(formData, "registrationNumber"), vin: formText(formData, "vin") });
    revalidateVehicles();
    return { saved: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function changeVehicleManager(vehicleId: string, _prev: ChangeManagerState, formData: FormData): Promise<ChangeManagerState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).changeVehicleManager(vehicleId, formText(formData, "managerId"));
    revalidateVehicles();
    return { changed: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function setVehicleAlarm(vehicleId: string, enabled: boolean): Promise<VehicleActionState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).setVehicleAlarm(vehicleId, enabled);
    revalidateVehicles();
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deactivateVehicle(vehicleId: string): Promise<VehicleActionState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).deactivateVehicle(vehicleId);
    revalidateVehicles();
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function changeSiteManager(siteId: string, _prev: ChangeManagerState, formData: FormData): Promise<ChangeManagerState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).changeSiteManager(siteId, formText(formData, "managerId"));
    revalidateSites();
    return { changed: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export interface AddressFormState {
  error?: string;
  changed?: boolean;
}

/** Nowy adres budowy; pinezka na mapie idzie pod nowy adres. */
export async function changeSiteAddress(siteId: string, _prev: AddressFormState, formData: FormData): Promise<AddressFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).changeSiteAddress(siteId, formText(formData, "address"));
    revalidateSites();
    return { changed: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Adres bazy na mapie budów; pusty zdejmuje bazę z mapy. */
export async function setBaseAddress(_prev: AddressFormState, formData: FormData): Promise<AddressFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).setBaseAddress(formText(formData, "address"));
    revalidateSites();
    revalidatePath(settingsHref("sprzet"));
    return { changed: true };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Pinezka przeciągnięta albo wskazana na mapie budów. */
export async function moveMapPin(locationId: string, position: MapPosition): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).moveMapPin(locationId, position);
    revalidateSites();
    return {};
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
