/**
 * Jednorazowo po wdrożeniu mapy budów (ADR 0026): geokoduje bazy z adresem i aktywne budowy, które nie mają jeszcze
 * położenia, we wszystkich firmach poza demo. Ręcznie postawionych pinezek nie rusza; można uruchomić ponownie.
 *
 *   npm run sites:geocode
 *
 * Łączy się z bazą ze zmiennych z .env.local i geokoduje kluczem z GOOGLE_MAPS_SERVER_KEY (zob. README).
 */
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";

if (!serverEnv.geocoder()) {
  console.error("Brak GOOGLE_MAPS_SERVER_KEY (albo GEOCODER=staly): nie ma czym geokodować.");
  process.exit(1);
}
const { placed, notFound } = await getRegistry().system().geocodeUnplacedLocations();
console.log(`Postawione na mapie: ${placed}. Nie znaleziono adresu: ${notFound}.`);
process.exit(0);
