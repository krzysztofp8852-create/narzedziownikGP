import type { EvalCompany } from "./eval";

/**
 * Zawbud: baza w Swarzędzu, trzy aktywne budowy (Rataje Adama Nowaka, Winogrady Ewy Lis, Łazarz Piotra
 * Wiśniewskiego), zakończone Jeżyce i dwa serwisy. Na bazie po dwie szlifierki, młoty i wkrętarki, więc
 * „szlifierka” bez szczegółów to pytanie; agregat Fogo i młot Hilti TE 1000 są w serwisie.
 */
export const zawbud: EvalCompany = {
  name: "Zawbud",
  base: "Baza Swarzędz",
  people: [
    { name: "Jan Kowalski", role: "wlasciciel" },
    { name: "Adam Nowak", role: "kierownik" },
    { name: "Ewa Lis", role: "kierownik" },
    { name: "Piotr Wiśniewski", role: "kierownik" },
    { name: "Marek Zieliński", role: "magazynier" },
  ],
  sites: [
    { name: "Rataje", manager: "Adam Nowak" },
    { name: "Winogrady", manager: "Ewa Lis" },
    { name: "Łazarz", manager: "Piotr Wiśniewski" },
    { name: "Jeżyce", manager: "Ewa Lis", status: "zakonczona" },
  ],
  services: ["Serwis Hilti Poznań", "Serwis Elektronarzędzi Kórnik"],
  tools: [
    { code: "S-01", name: "Szlifierka kątowa Makita 125 mm", category: "Szlifierki", at: "Baza Swarzędz" },
    { code: "S-02", name: "Szlifierka kątowa Bosch 230 mm", category: "Szlifierki", at: "Baza Swarzędz" },
    { code: "S-03", name: "Szlifierka kątowa DeWalt 125 mm", category: "Szlifierki", at: "Winogrady" },
    { code: "S-04", name: "Szlifierka kątowa Makita 230 mm", category: "Szlifierki", at: "Rataje" },
    { code: "H-01", name: "Młot udarowo-obrotowy Hilti TE 30", category: "Młoty", at: "Baza Swarzędz" },
    { code: "H-02", name: "Młot wyburzeniowy Makita HM1307", category: "Młoty", at: "Baza Swarzędz" },
    { code: "H-03", name: "Młot udarowo-obrotowy Bosch GBH 2-28", category: "Młoty", at: "Łazarz" },
    { code: "H-04", name: "Młot wyburzeniowy Hilti TE 1000", category: "Młoty", at: "Serwis Hilti Poznań" },
    { code: "A-01", name: "Agregat prądotwórczy Honda 3 kW", category: "Agregaty", at: "Baza Swarzędz" },
    { code: "A-02", name: "Agregat prądotwórczy Fogo 6 kW", category: "Agregaty", at: "Serwis Elektronarzędzi Kórnik" },
    { code: "N-01", name: "Niwelator laserowy Bosch GRL 300", category: "Niwelatory", at: "Baza Swarzędz" },
    { code: "N-02", name: "Niwelator optyczny Nivel System N24", category: "Niwelatory", at: "Rataje" },
    { code: "Z-01", name: "Zagęszczarka płytowa Wacker 90 kg", category: "Zagęszczarki", at: "Baza Swarzędz" },
    { code: "Z-02", name: "Stopa wibracyjna Wacker BS 60", category: "Zagęszczarki", at: "Winogrady" },
    { code: "W-01", name: "Wkrętarka Makita 18V", category: "Wkrętarki", at: "Baza Swarzędz" },
    { code: "W-02", name: "Wkrętarka DeWalt 18V", category: "Wkrętarki", at: "Baza Swarzędz" },
    { code: "W-03", name: "Wkrętarka Milwaukee M18", category: "Wkrętarki", at: "Rataje" },
    { code: "P-01", name: "Pilarka tarczowa Makita", category: "Piły", at: "Baza Swarzędz" },
    { code: "P-02", name: "Piła szablasta Bosch", category: "Piły", at: "Baza Swarzędz" },
    { code: "T-01", name: "Przecinarka spalinowa Stihl TS 420", category: "Przecinarki", at: "Baza Swarzędz" },
    { code: "M-01", name: "Mieszarka do zapraw Collomix", category: "Mieszarki", at: "Baza Swarzędz" },
    { code: "O-01", name: "Odkurzacz przemysłowy Kärcher", category: "Odkurzacze", at: "Baza Swarzędz" },
  ],
};

/**
 * Budmax: jeden kierownik z dwiema budowami (więc „moja budowa” nic nie przesądza), a narzędzia nazwane
 * samą marką i modelem; rodzaj sprzętu mówi tylko kategoria.
 */
export const budmax: EvalCompany = {
  name: "Budmax",
  base: "Plac Luboń",
  people: [
    { name: "Tomasz Mazur", role: "wlasciciel" },
    { name: "Krzysztof Wójcik", role: "kierownik" },
  ],
  sites: [
    { name: "Osiedle Zielone", manager: "Krzysztof Wójcik" },
    { name: "Hala Komorniki", manager: "Krzysztof Wójcik" },
  ],
  services: [],
  tools: [
    { code: "SZ-01", name: "Makita GA9020", category: "Szlifierki kątowe", at: "Plac Luboń" },
    { code: "MT-01", name: "Hilti TE 70", category: "Młoty", at: "Plac Luboń" },
    { code: "MT-02", name: "Bosch GSH 11", category: "Młoty wyburzeniowe", at: "Plac Luboń" },
    { code: "AG-01", name: "Honda EU22i", category: "Agregaty prądotwórcze", at: "Plac Luboń" },
    { code: "NW-01", name: "Leica Rugby 620", category: "Niwelatory", at: "Osiedle Zielone" },
    { code: "ZG-01", name: "Weber CF2", category: "Zagęszczarki", at: "Plac Luboń" },
    { code: "ZG-02", name: "Wacker Neuson BS50-2", category: "Zagęszczarki", at: "Plac Luboń" },
  ],
};
