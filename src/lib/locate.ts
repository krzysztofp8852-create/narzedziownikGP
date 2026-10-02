import type { PhonePosition } from "@/registry/registry";

/**
 * Położenie telefonu w chwili skanu plakatu; null, gdy przeglądarka go nie poda (brak zgody, brak GPS, za długo).
 * Działa też bez sieci (GPS). Bierzemy je tylko teraz, nie w tle.
 */
export function locate(): Promise<PhonePosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
