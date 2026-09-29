import { t } from "@/i18n/t";
import type { LocationKind, NotifiedPlace } from "@/registry/registry";

/** „z budowy Rataje” albo „z pojazdu Bus WX 12345”. */
export function placeFrom(place: NotifiedPlace): string {
  return t(`places.from.${place.kind ?? "budowa"}`, { name: place.name });
}

/** „na budowie Rataje”, „na pojeździe Bus WX 12345”, „na bazie Magazyn” albo „w serwisie Hilti”; bez rodzaju budowa. */
export function placeAt(place: { name: string; kind?: LocationKind }): string {
  return t(`places.at.${place.kind ?? "budowa"}`, { name: place.name });
}
