/** Budowa albo pojazd: lokalizacje z zakładką „Koszty”. */
export type SiteOrVehicleKind = "budowa" | "pojazd";
/** Lokalizacje z własną stroną: budowa, pojazd i baza. Budowa i baza mają też zakładkę „Ludzie”. */
export type PlacePageKind = SiteOrVehicleKind | "baza";

export type PlacePageTab = "" | "/koszty" | "/koszty/eksport" | "/ludzie" | "/terminy";

/** Adres strony budowy, pojazdu albo bazy, np. /budowy/…/koszty albo /baza/ludzie. */
export function locationPagePath(kind: PlacePageKind, id: string, tab: PlacePageTab = "") {
  if (kind === "baza") return `/baza${tab}`;
  return `${kind === "budowa" ? "/budowy" : "/pojazdy"}/${id}${tab}`;
}
