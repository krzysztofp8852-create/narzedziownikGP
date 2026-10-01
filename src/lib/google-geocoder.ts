import type { Geocoder, MapPosition } from "@/registry/ports";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
/** Dłużej nie czekamy: zakładanie budowy nie może wisieć na dostawcy mapy. */
const TIMEOUT_MS = 5000;

/** Środek Poznania: tam stoi każdy adres w geokodowaniu `staly` (lokalnie i w teście dymnym, bez Google). */
export const FIXED_POSITION: MapPosition = { lat: 52.4083, lng: 16.9335 };

interface GeocodeResponse {
  status?: string;
  error_message?: string;
  results?: { geometry: { location: MapPosition } }[];
}

/**
 * Geokodowanie Google Maps Platform (Geocoding API) z serwera, kluczem serwera. Adres po polsku, z pierwszeństwem
 * dla Polski, ale bez zawężania do niej. Bierzemy pierwszy wynik, także przybliżony (np. sama miejscowość przy
 * działce): właściciel przesunie pinezkę.
 */
export function createGoogleGeocoder({ apiKey, fetch = globalThis.fetch }: { apiKey: string; fetch?: typeof globalThis.fetch }): Geocoder {
  return {
    async geocode(address) {
      const url = new URL(GEOCODE_URL);
      url.search = new URLSearchParams({ address, region: "pl", language: "pl", key: apiKey }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Geokodowanie Google: HTTP ${response.status}`);
      const body = (await response.json()) as GeocodeResponse;
      if (body.status === "ZERO_RESULTS") return null;
      const location = body.results?.[0]?.geometry.location;
      if (body.status !== "OK" || !location) {
        throw new Error(`Geokodowanie Google: ${body.status ?? "brak statusu"}${body.error_message ? ` (${body.error_message})` : ""}`);
      }
      return { lat: location.lat, lng: location.lng };
    },
  };
}

/** Każdy adres w tym samym punkcie (`FIXED_POSITION`). */
export const fixedGeocoder: Geocoder = { geocode: async () => FIXED_POSITION };
