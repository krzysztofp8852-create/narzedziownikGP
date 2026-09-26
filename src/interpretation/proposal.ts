// Propozycja ruchu jako dane: bez zależności od serwera, więc korzysta z niej też przeglądarka.

/** Rodzaje ruchu, które rozumie wpis tekstem. */
export const PROPOSAL_KINDS = ["wydanie", "zwrot", "przeniesienie"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

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
  site: { id: string; name: string } | null;
  /** Skąd ruch zabiera sprzęt: baza przy wydaniu, budowa przy zwrocie i przeniesieniu; null, gdy nie wiadomo. */
  from: { id: string; name: string } | null;
  tools: ProposedTool[];
  ambiguities: { phrase: string; quantity: number; candidates: ProposedTool[] }[];
  unrecognized: ({ phrase: string; reason: "unknown" } | { phrase: string; reason: "unavailable"; missing: number })[];
}
