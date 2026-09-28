import { randomUUID } from "node:crypto";
import { RegistryError } from "@/registry/errors";
import {
  type CatalogTool,
  canMoveTools,
  canRegisterMovements,
  MAX_TRANSCRIPT_LENGTH,
  type RegisteredMovement,
  type RegisterMovementInput,
  type Registry,
  type Session,
} from "@/registry/registry";
import { PROPOSAL_KINDS, type Proposal, type ProposalKind, type ProposedTool } from "./proposal";
import { MAX_RECORDING_BYTES, type RecordingStore, recordingType, type Transcriber, TranscriptionFailedError } from "./transcription";

/** Co port interpretacji dostaje: tekst, narzędzia firmy (bez wartości) i aktywne budowy. */
export interface InterpretRequest {
  text: string;
  tools: Omit<CatalogTool, "id">[];
  /** `mine`: budowa, którą prowadzi aktor („na moją budowę”). */
  sites: { id: string; name: string; mine: boolean }[];
}

/** Narzędzie wspomniane w tekście: fraza, ile sztuk i kody wszystkich pasujących narzędzi firmy. */
export interface Mention {
  phrase: string;
  quantity: number;
  codes: string[];
}

/** Surowy wynik portu interpretacji; egzemplarze wybiera z niego dopiero moduł. */
export interface Interpretation {
  kind: ProposalKind;
  /** Budowa kierownika: docelowa przy wydaniu i przeniesieniu, źródłowa przy zwrocie. */
  siteId: string | null;
  /** Budowa, z której przeniesienie zabiera sprzęt, gdy padła w tekście. */
  fromSiteId: string | null;
  mentions: Mention[];
}

/**
 * Port interpretacji nie odpowiedział (awaria dostawcy AI, przekroczony czas); można spróbować ponownie.
 * Przy nagraniu `text` to rozpoznany tekst, żeby kierownik nie musiał mówić jeszcze raz.
 */
export class InterpretationFailedError extends Error {
  readonly text?: string;

  constructor(message: string, options?: ErrorOptions & { text?: string }) {
    super(message, options);
    this.name = "InterpretationFailedError";
    this.text = options?.text;
  }
}

/** Port interpretacji (model OpenAI ze strukturalnym wyjściem). */
export interface Interpreter {
  interpret(request: InterpretRequest): Promise<Interpretation>;
}

/** Propozycja zatwierdzona przez kierownika (po ewentualnych poprawkach) wraz z tekstem, z którego powstała. */
export interface ConfirmProposalInput extends Omit<RegisterMovementInput, "source" | "transcript" | "kind"> {
  kind: ProposalKind;
  text: string;
}

/**
 * Sesja aktora, który w ogóle rejestruje ruchy. Pracownikowi propozycja na nic, więc jego tekst ani nagranie
 * nie trafiają do dostawców AI.
 */
function requireMover(session: Session | null): Session {
  if (!session) throw new RegistryError("no_access");
  if (!canRegisterMovements(session)) throw new RegistryError("forbidden");
  return session;
}

/** Więcej sztuk z jednej frazy nie bierzemy; to raczej pomyłka niż ruch. */
const MAX_QUANTITY = 50;

/** Tyle Rejestru potrzebuje moduł: ewidencja aktora do propozycji i polecenie zapisu ruchu po zatwierdzeniu. */
export type InterpretationActor = Pick<ReturnType<Registry["as"]>, "session" | "toolCatalog" | "locations" | "registerMovement">;

interface Deps {
  registry: { as(userId: string): InterpretationActor };
  interpreter: Interpreter;
  transcriber: Transcriber;
  recordings: RecordingStore;
}

/**
 * Moduł Interpretacja: zamienia zdanie kierownika, wpisane albo nagrane, w Propozycję ruchu. Nigdy nie
 * zapisuje ruchu; zapis to zwykłe polecenie Rejestru po zatwierdzeniu.
 */
export function createInterpretation({ registry, interpreter, transcriber, recordings }: Deps) {
  return {
    as: (userId: string) => {
      const actor = registry.as(userId);
      const self = {
        /**
         * Nagranie → tekst → Propozycja. Nagranie leży w kubełku nagrań tylko na czas transkrypcji
         * i jest z niego usuwane także wtedy, gdy zapis albo transkrypcja się nie powiedzie.
         */
        async proposeFromRecording(audio: Blob): Promise<Proposal> {
          if (audio.size === 0 || audio.size > MAX_RECORDING_BYTES || !recordingType(audio)) throw new RegistryError("invalid_input");
          const session = requireMover(await actor.session());
          const key = `${session.company.id}/${randomUUID()}`;
          let heard: string;
          try {
            // Zapis może trafić do kubełka mimo błędu (np. zgubiona odpowiedź), więc i wtedy usuwamy.
            await recordings.save(key, audio);
            heard = await transcriber.transcribe(audio);
          } finally {
            await removeRecording(recordings, key);
          }
          const text = heard.trim();
          if (!text) throw new TranscriptionFailedError("silence", "W nagraniu nie słychać mowy");
          try {
            return await self.propose(text);
          } catch (error) {
            if (!(error instanceof InterpretationFailedError)) throw error;
            throw new InterpretationFailedError(error.message, { cause: error, text });
          }
        },

        async propose(raw: string): Promise<Proposal> {
          const text = raw.trim();
          if (!text || text.length > MAX_TRANSCRIPT_LENGTH) throw new RegistryError("invalid_input");
          const session = requireMover(await actor.session());
          const [catalog, locations] = await Promise.all([actor.toolCatalog(), actor.locations()]);
          const sites = locations.sites.filter((site) => site.status === "aktywna");
          const interpretation = await interpreter.interpret({
            text,
            tools: catalog.map(({ code, name, category, location }) => ({ code, name, category, location })),
            sites: sites.map((site) => ({ id: site.id, name: site.name, mine: site.manager.id === userId })),
          });
          const { kind } = interpretation;
          const siteById = new Map(sites.map((site) => [site.id, site]));
          let site = (interpretation.siteId && siteById.get(interpretation.siteId)) || null;
          const fromSite = (kind === "przeniesienie" && interpretation.fromSiteId && siteById.get(interpretation.fromSiteId)) || null;

          // Skąd ruch może zabrać sprzęt: przy zwrocie bez budowy z każdej, z której aktor zwraca,
          // a przy przeniesieniu bez budowy źródłowej z każdej innej niż docelowa.
          const candidateSources: string[] =
            kind === "wydanie"
              ? [locations.base.id]
              : kind === "zwrot"
                ? site
                  ? [site.id]
                  : sites.filter((candidate) => canMoveTools(session, candidate)).map((candidate) => candidate.id)
                : fromSite
                  ? [fromSite.id]
                  : sites.filter((candidate) => candidate.id !== site?.id).map((candidate) => candidate.id);
          const sources = singleSource(candidateSources, interpretation.mentions, catalog);
          const resolved = resolveMentions(interpretation.mentions, catalog, (tool) => sources.includes(tool.location.id));

          // Budowa źródłowa wynika z rozpoznanych narzędzi, gdy wszystkie są na jednej.
          const toolSites = new Set(resolved.tools.map((tool) => catalog.find((entry) => entry.id === tool.id)!.location.id));
          const onlyToolSite = toolSites.size === 1 ? siteById.get([...toolSites][0]) : undefined;
          if (kind === "zwrot" && !site) site = onlyToolSite ?? null;
          const from = kind === "wydanie" ? locations.base : kind === "zwrot" ? site : (fromSite ?? onlyToolSite ?? null);

          return {
            text,
            kind,
            site: site && { id: site.id, name: site.name },
            from: from && { id: from.id, name: from.name },
            ...resolved,
          };
        },

        /** ✓: zwykłe polecenie „zarejestruj ruch” w Rejestrze, ze źródłem `glos` i zapisanym tekstem. */
        async confirm({ text, ...movement }: ConfirmProposalInput): Promise<RegisteredMovement> {
          if (!PROPOSAL_KINDS.includes(movement.kind)) throw new RegistryError("invalid_input");
          return actor.registerMovement({ ...movement, source: "glos", transcript: text });
        },
      };
      return self;
    },
  };
}

/**
 * Usuwa nagranie z kubełka, przy chwilowej awarii za drugim razem. Gdy i to zawiedzie, zostawia ślad
 * w logu serwera z kluczem nagrania do ręcznego usunięcia, ale nie przykrywa wyniku transkrypcji:
 * kierownik i tak nie usunie nagrania sam, a straciłby rozpoznany tekst.
 */
async function removeRecording(recordings: RecordingStore, key: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await recordings.remove(key);
      return;
    } catch (error) {
      if (attempt === 2) console.error(`Nie udało się usunąć nagrania ${key} z kubełka nagrań`, error);
    }
  }
}

/**
 * Ruch zabiera sprzęt z jednej lokalizacji. Z kilku możliwych wybiera tę, w której jest najwięcej
 * wspomnianych narzędzi; gdy kilka wypada tak samo, zostawia wszystkie i kierownik wybiera sam.
 */
function singleSource(sources: string[], mentions: Mention[], catalog: CatalogTool[]): string[] {
  if (sources.length < 2) return sources;
  const mentioned = new Set(mentions.flatMap((mention) => mention.codes));
  const counts = sources.map((id) => catalog.filter((tool) => tool.location.id === id && mentioned.has(tool.code)).length);
  const best = Math.max(...counts);
  return best > 0 && counts.filter((count) => count === best).length === 1 ? [sources[counts.indexOf(best)]] : sources;
}

/**
 * Zamienia wspomniane narzędzia na egzemplarze dostępne tam, skąd ruch zabiera sprzęt. Liczebnik
 * bierze tyle dostępnych, ile trzeba; gdy jest ich więcej, pyta, które; gdy mniej, bierze wszystkie
 * i mówi, ilu brakuje. Egzemplarz wzięty przez wcześniejszą frazę nie wraca w kolejnej.
 */
function resolveMentions(mentions: Mention[], catalog: CatalogTool[], available: (tool: CatalogTool) => boolean) {
  const byCode = new Map(catalog.map((tool) => [tool.code, tool]));
  const taken = new Set<string>();
  const tools: ProposedTool[] = [];
  const ambiguities: Proposal["ambiguities"] = [];
  const unrecognized: Proposal["unrecognized"] = [];

  for (const { phrase, quantity, codes } of mentions) {
    const known = [...new Set(codes)].flatMap((code) => byCode.get(code) ?? []);
    if (known.length === 0) {
      unrecognized.push({ phrase, reason: "unknown" });
      continue;
    }
    const wanted = Math.min(Math.max(1, Math.floor(quantity)), MAX_QUANTITY);
    const candidates = known
      .filter((tool) => available(tool) && !taken.has(tool.id))
      .map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, phrase }));
    if (candidates.length > wanted) {
      ambiguities.push({ phrase, quantity: wanted, candidates });
      continue;
    }
    for (const tool of candidates) taken.add(tool.id);
    tools.push(...candidates);
    if (candidates.length < wanted) unrecognized.push({ phrase, reason: "unavailable", missing: wanted - candidates.length });
  }
  return { tools, ambiguities, unrecognized };
}
