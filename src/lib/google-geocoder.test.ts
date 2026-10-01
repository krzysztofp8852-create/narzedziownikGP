import { describe, expect, it } from "vitest";
import { createGoogleGeocoder } from "./google-geocoder";

/** Dostawca, który na każde pytanie odpowiada tym samym i zapisuje, o jakie adresy URL pytano. */
function google(body: unknown, status = 200) {
  const asked: URL[] = [];
  const fetch = async (input: string | URL | Request) => {
    asked.push(new URL(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { asked, geocoder: createGoogleGeocoder({ apiKey: "klucz-serwera", fetch }) };
}

describe("geokodowanie w Google", () => {
  it("pyta o adres po polsku, z pierwszeństwem dla Polski, i zwraca punkt pierwszego wyniku", async () => {
    const { asked, geocoder } = google({
      status: "OK",
      results: [{ geometry: { location: { lat: 52.3925, lng: 16.9516 } } }, { geometry: { location: { lat: 1, lng: 1 } } }],
    });

    expect(await geocoder.geocode("ul. Piłsudskiego 12, Poznań")).toEqual({ lat: 52.3925, lng: 16.9516 });

    expect(asked).toHaveLength(1);
    expect(asked[0].origin + asked[0].pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({
      address: "ul. Piłsudskiego 12, Poznań",
      region: "pl",
      language: "pl",
      key: "klucz-serwera",
    });
  });

  it("adres, którego Google nie zna, nie ma położenia", async () => {
    const { geocoder } = google({ status: "ZERO_RESULTS", results: [] });

    expect(await geocoder.geocode("dz. nr 123/4, Nigdzie")).toBeNull();
  });

  it("odmowa, limit albo awaria Google to błąd, w którym nie ma klucza", async () => {
    for (const [body, status] of [
      [{ status: "REQUEST_DENIED", error_message: "The provided API key is invalid.", results: [] }, 200],
      [{ status: "OVER_QUERY_LIMIT", results: [] }, 200],
      [{ error: "Internal" }, 500],
    ] as const) {
      const { geocoder } = google(body, status);
      const error = await geocoder.geocode("ul. Piłsudskiego 12, Poznań").catch((caught: Error) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("klucz-serwera");
    }
  });
});
