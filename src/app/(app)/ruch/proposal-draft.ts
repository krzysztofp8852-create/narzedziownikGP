import { PROPOSAL_KINDS, type Proposal, type ProposalKind } from "@/interpretation/proposal";
import type { ChecklistData, ChecklistPlace, ChecklistTool } from "./checklist";

/** Propozycja poprawiona przez kierownika przed ✓. */
export interface Draft {
  kind: ProposalKind;
  /**
   * Budowa kierownika: docelowa przy wydaniu i przeniesieniu, źródłowa przy zwrocie, a przy wysłaniu do serwisu
   * budowa albo baza, z której sprzęt jedzie; pusta, gdy nie wybrana.
   */
  siteId: string;
  /** Serwis: docelowy przy wysłaniu do serwisu, źródłowy przy przyjęciu z serwisu; pusty, gdy nie wybrany. */
  serviceId: string;
  /** Skąd przeniesienie zabiera sprzęt, gdy wybrane wprost; puste, gdy wynika z wybranych narzędzi. */
  fromId: string;
  /** Rozpoznane i dodane narzędzia. */
  toolIds: string[];
  /** Wybór w każdym pytaniu propozycji, w kolejności pytań. */
  picks: string[][];
  /** „Wszystko z …”: wybrany jest cały sprzęt ze źródła poza usuniętym z listy (`excluded`). */
  everything: boolean;
  excluded: string[];
}

/** Co z poprawionej propozycji wynika: dokąd i skąd, jakie narzędzia i czy można już zatwierdzić. */
export interface DraftPlan {
  /** Rodzaje, które aktor może rejestrować. */
  kinds: ProposalKind[];
  /** Budowy do wyboru przy tym rodzaju, najpierw aktora; pusta lista, gdy rodzaj budowy nie potrzebuje. */
  sites: ChecklistPlace[];
  site: ChecklistPlace | null;
  /** Serwisy do wyboru przy wysłaniu do serwisu i przyjęciu z serwisu; przy pozostałych pusta lista. */
  services: ChecklistPlace[];
  service: ChecklistPlace | null;
  /** Skąd ruch może zabrać sprzęt, zanim wiadomo skąd: przy przeniesieniu każda budowa poza docelową. */
  sources: ChecklistPlace[];
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

/**
 * Punkt wyjścia: to, co zrozumiał system. Budowę i serwis spoza dozwolonych kierownik musi wybrać sam.
 * Propozycja z nagrania sprzed tej wersji (w kolejce offline telefonu) nie ma serwisu ani „wszystko”.
 */
export function startDraft(proposal: Proposal, data: ChecklistData): Draft {
  const allowed = (options: ChecklistPlace[], place: { id: string } | null | undefined) =>
    place && options.some((option) => option.id === place.id) ? place.id : "";
  const everything = proposal.everything ?? false;
  return {
    kind: proposal.kind,
    siteId: allowed(siteOptions(proposal.kind, data), proposal.site),
    serviceId: allowed(serviceOptions(proposal.kind, data), proposal.service),
    fromId: everything && proposal.kind === "przeniesienie" ? (proposal.from?.id ?? "") : "",
    toolIds: proposal.tools.map((tool) => tool.id),
    picks: proposal.ambiguities.map(() => []),
    everything,
    excluded: [],
  };
}

const places = (ids: string[] | undefined, data: ChecklistData) => (ids ?? []).flatMap((id) => data.places.find((place) => place.id === id) ?? []);

/**
 * Budowy, które aktor może wybrać przy danym rodzaju: docelowe przy wydaniu i przeniesieniu, źródłowe przy
 * zwrocie i wysłaniu do serwisu (tu także baza dla magazyniera i właściciela). Przyjęcie z serwisu budowy nie ma.
 */
function siteOptions(kind: ProposalKind, data: ChecklistData): ChecklistPlace[] {
  const route = data.routes[kind];
  if (kind === "z_serwisu") return [];
  return places(kind === "zwrot" || kind === "do_serwisu" ? route?.from : route?.to, data);
}

/** Serwisy do wyboru: docelowe przy wysłaniu do serwisu, źródłowe przy przyjęciu z serwisu. */
function serviceOptions(kind: ProposalKind, data: ChecklistData): ChecklistPlace[] {
  const route = data.routes[kind];
  return kind === "do_serwisu" ? places(route?.to, data) : kind === "z_serwisu" ? places(route?.from, data) : [];
}

/** Dokąd i skąd prowadzi poprawiona propozycja, które narzędzia są nie tam, gdzie trzeba, i czy można ją zatwierdzić. */
export function planDraft(draft: Draft, proposal: Proposal, data: ChecklistData): DraftPlan {
  const placeOf = new Map(data.places.flatMap((place) => place.tools.map((tool) => [tool.id, { place, tool }] as const)));
  const route = data.routes[draft.kind];
  const sites = siteOptions(draft.kind, data);
  const site = sites.find((candidate) => candidate.id === draft.siteId) ?? null;
  const services = serviceOptions(draft.kind, data);
  const service = services.find((candidate) => candidate.id === draft.serviceId) ?? null;

  const explicit = [...new Set([...draft.toolIds, ...draft.picks.flat()])].flatMap((id) => placeOf.get(id) ?? []);
  // Skąd ruch może zabrać sprzęt: przy przeniesieniu z każdej budowy poza docelową.
  const sources = places(route?.from, data).filter((place) => draft.kind !== "przeniesienie" || place.id !== site?.id);
  const from =
    draft.kind === "wydanie"
      ? (sources[0] ?? null)
      : draft.kind === "zwrot" || draft.kind === "do_serwisu"
        ? site
        : draft.kind === "z_serwisu"
          ? service
          : (sources.find((place) => place.id === draft.fromId) ??
            (draft.everything ? null : (sources.find((place) => place.id === explicit[0]?.place.id) ?? null)));
  const to = draft.kind === "do_serwisu" ? service : draft.kind === "wydanie" || draft.kind === "przeniesienie" ? site : (places(route?.to, data)[0] ?? null);

  // „Wszystko z …”: cały sprzęt ze źródła, więc lista idzie za wybraną budową, serwisem albo miejscem, skąd.
  const selected = draft.everything
    ? (from?.tools ?? []).filter((tool) => !draft.excluded.includes(tool.id)).map((tool) => ({ place: from!, tool }))
    : explicit;
  const tools = selected.map((entry) => entry.tool);
  const misplaced = selected.filter((entry) => entry.place.id !== from?.id).map((entry) => entry.tool);
  const chosen = new Set(tools.map((tool) => tool.id));
  const addable = (from ? [from] : sources).flatMap((place) => place.tools).filter((tool) => !chosen.has(tool.id));
  const open = draft.everything ? 0 : proposal.ambiguities.filter((question, index) => (draft.picks[index]?.length ?? 0) < question.quantity).length;

  return {
    kinds: PROPOSAL_KINDS.filter((kind) => data.routes[kind]),
    sites,
    site,
    services,
    service,
    sources,
    from,
    to,
    tools,
    misplaced,
    addable,
    open,
    ready: !!from && !!to && tools.length > 0 && misplaced.length === 0 && open === 0,
  };
}
