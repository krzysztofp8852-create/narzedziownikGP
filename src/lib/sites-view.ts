import { SITES_HREF } from "@/lib/nav-path";
import type { Session } from "@/registry/registry";

/** Widok strony Budowy: lista budów albo mapa. */
export type SitesView = "lista" | "mapa";

/** Zakończone budowy na stronie Budowy; tu prowadzi też zamknięcie budowy i dawny adres /budowy/zakonczone. */
export const FINISHED_SITES_HREF = `${SITES_HREF}#zakonczone`;

/** Budowa z kierownikiem: tyle wystarczy, żeby wiedzieć, czy kierownik ją widzi. */
type ManagedSite = { id: string; manager: { id: string } };

/** Mapa tylko z `?widok=mapa`; bez parametru, z innym albo z kilkoma strona pokazuje listę. */
export function parseSitesView(param: string | string[] | undefined): SitesView {
  return param === "mapa" ? "mapa" : "lista";
}

/** Adres widoku: lista to sama strona Budowy, mapa ma parametr. */
export function sitesViewHref(view: SitesView): string {
  return view === "mapa" ? `${SITES_HREF}?widok=mapa` : SITES_HREF;
}

/**
 * Które budowy pokazuje strona Budowy: kierownik ma pod „Moje budowy” tylko te, którymi kieruje (na mapie także bazę),
 * a reszta firmy wszystkie. Zawęża sam widok; tablica i strona budowy dalej pokazują sprzęt całej firmy.
 */
export function sitesShownTo(session: Session) {
  const onlyManaged = session.role === "kierownik";
  const shown = (site: ManagedSite) => !onlyManaged || site.manager.id === session.userId;
  return {
    /** Kierownik widzi tylko budowy, którymi kieruje („Moje budowy”). */
    onlyManaged,
    sites: <T extends ManagedSite>(sites: T[]): T[] => sites.filter(shown),
    /** Pinezki mapy (bez kierownika): baza zawsze, budowa, gdy w `sites` (z kierownikami) jest pokazana. */
    pins: <P extends { id: string; kind: "baza" | "budowa" }>(pins: P[], sites: ManagedSite[]): P[] => {
      const shownIds = new Set(sites.filter(shown).map((site) => site.id));
      return pins.filter((pin) => pin.kind === "baza" || shownIds.has(pin.id));
    },
  };
}
