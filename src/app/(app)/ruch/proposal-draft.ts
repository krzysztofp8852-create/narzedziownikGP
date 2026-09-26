import { PROPOSAL_KINDS, type Proposal, type ProposalKind } from "@/interpretation/proposal";
import type { ChecklistData, ChecklistPlace, ChecklistTool } from "./checklist";

/** Propozycja poprawiona przez kierownika przed ✓. */
export interface Draft {
  kind: ProposalKind;
  /** Budowa kierownika: docelowa przy wydaniu i przeniesieniu, źródłowa przy zwrocie; pusta, gdy nie wybrana. */
  siteId: string;
  /** Rozpoznane i dodane narzędzia. */
  toolIds: string[];
  /** Wybór w każdym pytaniu propozycji, w kolejności pytań. */
  picks: string[][];
}

/** Co z poprawionej propozycji wynika: dokąd i skąd, jakie narzędzia i czy można już zatwierdzić. */
export interface DraftPlan {
  /** Rodzaje, które aktor może rejestrować. */
  kinds: ProposalKind[];
  /** Budowy do wyboru przy tym rodzaju, najpierw aktora. */
  sites: ChecklistPlace[];
  site: ChecklistPlace | null;
  from: ChecklistPlace | null;
  to: ChecklistPlace | null;
  /** Wybrane narzędzia, które nadal są na tablicy. */
  tools: ChecklistTool[];
  /** Wybrane narzędzia, których nie ma tam, skąd ruch zabiera sprzęt. */
  misplaced: ChecklistTool[];
  /** Narzędzia, które można dopisać: są tam, skąd ruch zabiera sprzęt, i nie są wybrane. */
  addable: ChecklistTool[];
  /** Ile pytań czeka na odpowiedź. */
  open: number;
  ready: boolean;
}

/** Punkt wyjścia: to, co zrozumiał system. Budowę spoza dozwolonych kierownik musi wybrać sam. */
export function startDraft(proposal: Proposal, data: ChecklistData): Draft {
  const siteId = proposal.site?.id ?? "";
  return {
    kind: proposal.kind,
    siteId: siteOptions(proposal.kind, data).some((site) => site.id === siteId) ? siteId : "",
    toolIds: proposal.tools.map((tool) => tool.id),
    picks: proposal.ambiguities.map(() => []),
  };
}

/** Budowy, które aktor może wybrać przy danym rodzaju: docelowe przy wydaniu i przeniesieniu, źródłowe przy zwrocie. */
function siteOptions(kind: ProposalKind, data: ChecklistData): ChecklistPlace[] {
  const route = data.routes[kind];
  const ids = route ? (kind === "zwrot" ? route.from : route.to) : [];
  return ids.flatMap((id) => data.places.find((place) => place.id === id) ?? []);
}

/** Dokąd i skąd prowadzi poprawiona propozycja, które narzędzia są nie tam, gdzie trzeba, i czy można ją zatwierdzić. */
export function planDraft(draft: Draft, proposal: Proposal, data: ChecklistData): DraftPlan {
  const byId = new Map(data.places.map((place) => [place.id, place]));
  const placeOf = new Map(data.places.flatMap((place) => place.tools.map((tool) => [tool.id, { place, tool }] as const)));
  const route = data.routes[draft.kind];
  const sites = siteOptions(draft.kind, data);
  const site = sites.find((candidate) => candidate.id === draft.siteId) ?? null;

  const selected = [...new Set([...draft.toolIds, ...draft.picks.flat()])].flatMap((id) => placeOf.get(id) ?? []);
  // Skąd ruch może zabrać sprzęt: przy przeniesieniu z każdej budowy poza docelową.
  const sources = (route?.from ?? []).flatMap((id) => byId.get(id) ?? []).filter((place) => draft.kind !== "przeniesienie" || place.id !== site?.id);
  const from =
    draft.kind === "wydanie"
      ? (sources[0] ?? null)
      : draft.kind === "zwrot"
        ? site
        : (sources.find((place) => place.id === selected[0]?.place.id) ?? null);
  const to = draft.kind === "zwrot" ? (route ? (byId.get(route.to[0]) ?? null) : null) : site;

  const tools = selected.map((entry) => entry.tool);
  const misplaced = selected.filter((entry) => entry.place.id !== from?.id).map((entry) => entry.tool);
  const chosen = new Set(tools.map((tool) => tool.id));
  const addable = (from ? [from] : sources).flatMap((place) => place.tools).filter((tool) => !chosen.has(tool.id));
  const open = proposal.ambiguities.filter((question, index) => (draft.picks[index]?.length ?? 0) < question.quantity).length;

  return {
    kinds: PROPOSAL_KINDS.filter((kind) => data.routes[kind]),
    sites,
    site,
    from,
    to,
    tools,
    misplaced,
    addable,
    open,
    ready: !!from && !!to && tools.length > 0 && misplaced.length === 0 && open === 0,
  };
}
