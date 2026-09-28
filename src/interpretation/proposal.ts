// Propozycja ruchu jako dane: bez zależności od serwera, więc korzysta z niej też przeglądarka.

/** Rodzaje ruchu, które rozumie wpis tekstem: wszystkie, które rejestruje polecenie „zarejestruj ruch”. */
export const PROPOSAL_KINDS = ["wydanie", "zwrot", "przeniesienie", "do_serwisu", "z_serwisu"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** Rodzaje z serwisem po jednej stronie: serwis wybiera się osobno od budowy. */
export const SERVICE_KINDS: readonly ProposalKind[] = ["do_serwisu", "z_serwisu"];

/** Egzemplarz w propozycji: rozpoznany z frazy albo kandydat w pytaniu. */
export interface ProposedTool {
  id: string;
  code: string;
  name: string;
  /** Fraza z tekstu, z której wzięło się narzędzie. */
  phrase: string;
}

/** Propozycja ruchu do zatwierdzenia; sama nic nie zapisuje. */
export interface Proposal {
  text: string;
  kind: ProposalKind;
  /**
   * Budowa kierownika: docelowa przy wydaniu i przeniesieniu, źródłowa przy zwrocie, a przy wysłaniu
   * do serwisu budowa albo baza, z której sprzęt jedzie. Null przy przyjęciu z serwisu i gdy nie padła.
   */
  site: { id: string; name: string } | null;
  /** Serwis: docelowy przy wysłaniu do serwisu, źródłowy przy przyjęciu z serwisu. Brak albo null przy pozostałych. */
  service?: { id: string; name: string } | null;
  /** Skąd ruch zabiera sprzęt: baza przy wydaniu, budowa przy zwrocie i przeniesieniu; null, gdy nie wiadomo. */
  from: { id: string; name: string } | null;
  /** „Wszystko z …”: ruch zabiera cały sprzęt ze źródła, a nie wymienione narzędzia. */
  everything?: boolean;
  tools: ProposedTool[];
  ambiguities: { phrase: string; quantity: number; candidates: ProposedTool[] }[];
  unrecognized: ({ phrase: string; reason: "unknown" } | { phrase: string; reason: "unavailable"; missing: number })[];
}

/** Narzędzie w odpowiedzi na pytanie „gdzie jest …”: gdzie jest teraz, od ilu dni i kto za nie odpowiada. */
export interface FoundTool {
  id: string;
  code: string;
  name: string;
  place: { name: string; kind: "baza" | "budowa" | "serwis" | "pojazd" };
  daysInPlace: number;
  /** Kierownik budowy albo pojazdu; na bazie i w serwisie nikt. */
  responsible: string | null;
}

/** Odpowiedź na pytanie „gdzie jest …” zamiast propozycji ruchu; sama nic nie zapisuje. */
export interface WhereAnswer {
  text: string;
  /** Narzędzia w obiegu, o które pytano, po kodzie. */
  tools: FoundTool[];
  /** Frazy, w których nie rozpoznano żadnego narzędzia firmy. */
  unrecognized: string[];
}

/** Co system odpowiada na zdanie z „Powiedz lub wpisz”: propozycję ruchu albo, na pytanie, gdzie jest sprzęt. */
export type Reply = { proposal: Proposal; where?: undefined } | { where: WhereAnswer; proposal?: undefined };
