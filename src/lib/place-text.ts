import { t } from "@/i18n/t";
import type { NotifiedPlace } from "@/registry/registry";

/** „z budowy Rataje” albo „z pojazdu Bus WX 12345”. */
export function placeFrom(place: NotifiedPlace): string {
  return t(`places.from.${place.kind ?? "budowa"}`, { name: place.name });
}

/** „na budowie Rataje” albo „na pojeździe Bus WX 12345”. */
export function placeAt(place: NotifiedPlace): string {
  return t(`places.at.${place.kind ?? "budowa"}`, { name: place.name });
}
