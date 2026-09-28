// Zestaw ewaluacyjny interpretacji: jak prawdziwy port interpretacji (i transkrypcji) rozumie budowlaną polszczyznę.
// Uruchamiany ręcznie (`npm run eval:interpretation`), nie w CI; zob. README.md obok.
import type { CatalogTool, Role, Site } from "@/registry/registry";
import { createInterpretation, type InterpretationActor, InterpretationFailedError, type Interpreter } from "../interpretation";
import type { Proposal, ProposalKind } from "../proposal";
import type { Transcriber } from "../transcription";

/** Przykładowa ewidencja firmy: osoby, lokalizacje po nazwie i narzędzia w obiegu z miejscem, w którym są. */
export interface EvalCompany {
  name: string;
  base: string;
  people: { name: string; role: Role }[];
  sites: { name: string; manager: string; status?: Site["status"] }[];
  services: string[];
  tools: { code: string; name: string; category: string; at: string }[];
}

/** Oczekiwana Propozycja: lokalizacje po nazwie, narzędzia po kodzie; frazy zależą od modelu, więc się nie liczą. */
export interface ExpectedProposal {
  kind: ProposalKind;
  site: string | null;
  /** Skąd ruch zabiera sprzęt; bez tego pola nie jest sprawdzane. */
  from?: string | null;
  tools: string[];
  /** Pytania „które?”: ile sztuk i kody kandydatów. Domyślnie żadnych. */
  ambiguities?: { quantity: number; candidates: string[] }[];
  /** Nierozpoznane frazy: nieznane narzędzie albo ilu sztuk brakuje. Domyślnie żadnych. */
  unrecognized?: ({ reason: "unknown" } | { reason: "unavailable"; missing: number })[];
}

export interface EvalCase {
  id: string;
  tags: string[];
  company: EvalCompany;
  /** Kto mówi (osoba z ewidencji); domyślnie pierwszy kierownik. */
  actor?: string;
  /** Zdanie kierownika; przy nagraniu to, co naprawdę powiedział (do raportu). */
  text: string;
  /** Nagranie z budowy, ścieżka względem katalogu zestawu; idzie przez port transkrypcji. */
  recording?: string;
  expected: ExpectedProposal;
}

export type CheckField = "kind" | "site" | "from" | "tools" | "ambiguities" | "unrecognized";

export interface Check {
  field: CheckField;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface CaseResult {
  id: string;
  tags: string[];
  /** Zdanie przypadku: to, co zostało napisane albo naprawdę powiedziane w nagraniu. */
  said: string;
  recording: string | null;
  /** Tekst, który dostała interpretacja: zdanie przypadku albo rozpoznany z nagrania. */
  text: string;
  passed: boolean;
  checks: Check[];
  /** Błąd portu albo przypadku; wtedy przypadek jest nietrafiony. */
  error: string | null;
}

interface Ports {
  interpreter: Interpreter;
  transcriber: Transcriber;
  loadRecording: (path: string) => Promise<Blob>;
}

/**
 * Uruchamia przypadki na podanych portach przez moduł Interpretacja i ocenia każdą Propozycję.
 * Najwyżej `concurrency` przypadków naraz; wyniki w kolejności przypadków.
 */
export async function runEval(cases: EvalCase[], ports: Ports, { concurrency = 1 } = {}): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const index = next++;
      results[index] = await runCase(cases[index], ports);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}

async function runCase(evalCase: EvalCase, { interpreter, transcriber, loadRecording }: Ports): Promise<CaseResult> {
  const { company } = evalCase;
  const base = { id: evalCase.id, tags: evalCase.tags, said: evalCase.text, recording: evalCase.recording ?? null };
  const failed = (error: unknown, text = evalCase.text): CaseResult => ({ ...base, text, passed: false, checks: [], error: describe(error) });
  const problems = caseProblems(evalCase);
  if (problems.length > 0) return failed(new Error(`Błędny przypadek: ${problems.join("; ")}`));

  const actor = evalCase.actor ?? company.people.find((person) => person.role === "kierownik")!.name;
  const interpretation = createInterpretation({
    registry: { as: () => evidence(company, actor) },
    interpreter,
    transcriber,
    // Nagranie przechodzi tę samą ścieżkę co w aplikacji (limity, typ, cisza); kubełek nagrań nie jest tu potrzebny.
    recordings: { save: async () => {}, remove: async () => {} },
  }).as(personId(actor));
  try {
    const proposal = evalCase.recording
      ? await interpretation.proposeFromRecording(await loadRecording(evalCase.recording))
      : await interpretation.propose(evalCase.text);
    const checks = score(evalCase.expected, proposal);
    return { ...base, text: proposal.text, passed: checks.every((check) => check.passed), checks, error: null };
  } catch (error) {
    // Rozpoznany tekst zostaje w raporcie także wtedy, gdy zawiodła interpretacja.
    return failed(error, error instanceof InterpretationFailedError ? (error.text ?? evalCase.text) : evalCase.text);
  }
}

/** Komunikat błędu z przyczynami, np. „OpenAI API (Connection error.)”. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause === undefined ? error.message : `${error.message} (${describe(error.cause)})`;
}

/**
 * Czym przypadek rozmija się ze swoją ewidencją: nieznane osoby, lokalizacje i kody w oczekiwanej
 * Propozycji. Taki przypadek nic nie mówi o modelu, więc nie trafia do portu.
 */
export function caseProblems({ company, actor, expected }: EvalCase): string[] {
  const problems: string[] = [];
  const people = new Set(company.people.map((person) => person.name));
  const sites = company.sites.filter((site) => (site.status ?? "aktywna") === "aktywna").map((site) => site.name);
  const locations = new Set([company.base, ...company.sites.map((site) => site.name), ...company.services]);
  const codes = new Set<string>();

  if (actor !== undefined && !people.has(actor)) problems.push(`nie ma osoby ${actor}`);
  if (actor === undefined && !company.people.some((person) => person.role === "kierownik")) problems.push("w ewidencji nie ma kierownika");
  for (const site of company.sites) {
    if (!people.has(site.manager)) problems.push(`kierownik budowy ${site.name}: nie ma osoby ${site.manager}`);
  }
  for (const tool of company.tools) {
    if (codes.has(tool.code)) problems.push(`kod ${tool.code} się powtarza`);
    codes.add(tool.code);
    if (!locations.has(tool.at)) problems.push(`${tool.code} jest w nieznanej lokalizacji ${tool.at}`);
  }
  if (expected.site !== null && !sites.includes(expected.site)) problems.push(`oczekiwana budowa ${expected.site} nie jest aktywną budową`);
  if (expected.from != null && !locations.has(expected.from)) problems.push(`oczekiwane „skąd” to nieznana lokalizacja ${expected.from}`);
  const expectedCodes = [...expected.tools, ...(expected.ambiguities ?? []).flatMap((ambiguity) => ambiguity.candidates)];
  for (const code of new Set(expectedCodes)) {
    if (!codes.has(code)) problems.push(`nie ma narzędzia ${code}`);
  }
  return problems;
}

const personId = (name: string) => `osoba:${name}`;

/** Ewidencja przypadku jako Rejestr aktora: tylko odczyty, których potrzebuje propozycja. */
function evidence(company: EvalCompany, actor: string): InterpretationActor {
  const person = company.people.find((candidate) => candidate.name === actor)!;
  const base = { id: "baza", name: company.base };
  const sites: Site[] = company.sites.map((site) => ({
    id: `budowa:${site.name}`,
    name: site.name,
    address: "",
    status: site.status ?? "aktywna",
    manager: { id: personId(site.manager), fullName: site.manager, active: true },
  }));
  const services = company.services.map((name) => ({ id: `serwis:${name}`, name }));
  const locations = [
    { ...base, kind: "baza" as const },
    ...sites.map((site) => ({ id: site.id, name: site.name, kind: "budowa" as const })),
    ...services.map((service) => ({ ...service, kind: "serwis" as const })),
  ];
  const catalog: CatalogTool[] = company.tools
    .map((tool) => ({
      id: `narzedzie:${tool.code}`,
      code: tool.code,
      name: tool.name,
      category: tool.category,
      location: locations.find((location) => location.name === tool.at)!,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    session: async () => ({
      userId: personId(person.name),
      fullName: person.name,
      role: person.role,
      mustChangePassword: false,
      company: { id: "firma", name: company.name, readOnly: false },
    }),
    toolCatalog: async () => catalog,
    locations: async () => ({ base, sites, services }),
    registerMovement: async () => {
      throw new Error("Zestaw ewaluacyjny niczego nie zapisuje");
    },
  };
}

/** Porównuje Propozycję z oczekiwaną pole po polu; kolejność narzędzi, pytań i fraz się nie liczy. */
function score(expected: ExpectedProposal, proposal: Proposal): Check[] {
  const check = (field: CheckField, want: string, got: string): Check => ({ field, passed: want === got, expected: want, actual: got });
  const codes = (list: string[]) => [...list].sort().join(", ") || "—";
  const ambiguities = (list: { quantity: number; candidates: string[] }[]) =>
    list.map(({ quantity, candidates }) => `${quantity} z [${codes(candidates)}]`).sort().join("; ") || "—";
  const unrecognized = (list: NonNullable<ExpectedProposal["unrecognized"]>) =>
    list.map((entry) => (entry.reason === "unknown" ? "nieznane" : `brakuje ${entry.missing}`)).sort().join("; ") || "—";

  const checks = [
    check("kind", expected.kind, proposal.kind),
    check("site", expected.site ?? "—", proposal.site?.name ?? "—"),
    check("tools", codes(expected.tools), codes(proposal.tools.map((tool) => tool.code))),
    check(
      "ambiguities",
      ambiguities(expected.ambiguities ?? []),
      ambiguities(proposal.ambiguities.map(({ quantity, candidates }) => ({ quantity, candidates: candidates.map((tool) => tool.code) }))),
    ),
    check("unrecognized", unrecognized(expected.unrecognized ?? []), unrecognized(proposal.unrecognized)),
  ];
  if (expected.from !== undefined) checks.splice(2, 0, check("from", expected.from ?? "—", proposal.from?.name ?? "—"));
  return checks;
}
