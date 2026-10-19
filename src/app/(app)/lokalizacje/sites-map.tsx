import type { MapPin, ToolOnBoard, WhereIsWhat } from "@/registry/registry";
import { DemoSiteMap, type MapDevice, type MapPlace } from "../demo-site-map";
import { type GoogleMapsConfig, SiteMap, type SiteMapPin } from "../site-map";

/**
 * Mapa firmy demo (ADR 0026): rejestr nie zna lokalizatorów, więc „urządzeniami z lokalizatorem” są pierwsze
 * narzędzia z każdego miejsca. Prawdziwa firma tego nie widzi.
 */
function demoMapData({ base, sites, vehicles }: WhereIsWhat): { places: MapPlace[]; devices: MapDevice[] } {
  const places: MapPlace[] = [
    { id: base.id, kind: "base", name: base.name, toolCount: base.tools.length },
    ...sites.map((site) => ({ id: site.id, kind: "site" as const, name: site.name, address: site.address, toolCount: site.tools.length })),
    ...vehicles.map((vehicle) => ({ id: vehicle.id, kind: "vehicle" as const, name: vehicle.name, toolCount: vehicle.tools.length })),
  ];
  const tracked = (placeId: string, tools: ToolOnBoard[], count: number) =>
    tools.slice(0, count).map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, placeId }));
  const devices = [
    ...tracked(base.id, base.tools, 2),
    ...sites.flatMap((site) => tracked(site.id, site.tools, 2)),
    ...vehicles.flatMap((vehicle) => tracked(vehicle.id, vehicle.tools, 1)),
  ];
  return { places, devices };
}

/** Pinezki mapy budów z liczbą narzędzi z tablicy (tej samej chwili co reszta strony). */
function sitePins(pins: MapPin[], { base, sites }: WhereIsWhat): SiteMapPin[] {
  const toolCounts = new Map([base, ...sites].map((place) => [place.id, place.tools.length]));
  return pins.map((pin) => ({ ...pin, toolCount: toolCounts.get(pin.id) ?? 0 }));
}

/**
 * Mapa budów: firma demo ma mapę demo bez dostawcy mapy, a prawdziwa firma mapę Google z pinezkami `pins`, o ile jest
 * klucz przeglądarki (`maps`); bez niego mapy nie ma. Pinezki przesuwa ten, kto zarządza lokalizacjami (`canEdit`).
 */
export function SitesMap({
  demo,
  board,
  pins,
  maps,
  canEdit,
}: {
  demo: boolean;
  board: WhereIsWhat;
  pins: MapPin[] | null;
  maps: GoogleMapsConfig | null;
  canEdit: boolean;
}) {
  if (demo) return <DemoSiteMap {...demoMapData(board)} />;
  if (!maps || !pins) return null;
  return <SiteMap pins={sitePins(pins, board)} maps={maps} canEdit={canEdit} />;
}
