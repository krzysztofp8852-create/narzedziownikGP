import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { type Interpretation, InterpretationFailedError, type InterpretRequest, type Interpreter, type Mention } from "./interpretation";
import { PROPOSAL_KINDS, type ProposalKind } from "./proposal";

/** Model interpretacji ze specyfikacji: szybki i tani, ze strukturalnym wyjściem. */
const MODEL = "claude-haiku-4-5";

const SYSTEM = `Jesteś częścią aplikacji do ewidencji narzędzi małej firmy budowlanej w Polsce.
Kierownik budowy albo magazynier pisze jedno zdanie o tym, co zabiera lub oddaje, np. „biorę dwie szlifierki i młot na Rataje”.
Twoje zadanie: zrozumieć zdanie i dopasować je do narzędzi i budów firmy. Nic nie zapisujesz; człowiek zatwierdzi wynik.

Rodzaj ruchu (kind):
- "wydanie": sprzęt z bazy (magazynu) na budowę („biorę”, „wydaj”, „zabieram z bazy”, „na Rataje”).
- "zwrot": sprzęt z budowy na bazę („oddaję”, „zwracam”, „odwożę na bazę”, „wraca na magazyn”).
- "przeniesienie": sprzęt z jednej budowy na drugą („zabieram z Winograd na Rataje”, „przejmuję z Łazarza”).
Gdy zdanie nie przesądza, wybierz "wydanie".

Budowy (site, fromSite) podawaj wyłącznie jako oznaczenie z listy (np. "B2"), nigdy nazwą:
- site: budowa, na którą trafia sprzęt przy wydaniu i przeniesieniu, albo z której wraca przy zwrocie. Null, gdy nie padła. Słowa „moja budowa”, „do mnie” oznaczają budowę oznaczoną jako moja, jeśli jest jedna.
- fromSite: tylko przy przeniesieniu, budowa, z której sprzęt jest zabierany, jeśli padła w zdaniu; inaczej null.
Rozpoznawaj odmianę i skróty nazw („z Rataj”, „na Winogradach”, „Łazarz” → „Łazarzu”).

Narzędzia (mentions): jedna pozycja na każdą wzmiankę o narzędziu w zdaniu.
- phrase: dosłowny fragment zdania, np. "dwie szlifierki".
- quantity: ile sztuk (liczebniki słowami i cyframi: „dwie” = 2, „parę” = 2, bez liczebnika = 1).
- codes: kody WSZYSTKICH narzędzi firmy pasujących do wzmianki, niezależnie od tego, gdzie teraz są. Nie wybieraj konkretnych sztuk i nie patrz na lokalizację: to zrobi aplikacja. Gdy padł kod (np. „S-03”, „es zero trzy”) albo marka lub model, podaj tylko pasujące. Gdy nic nie pasuje, podaj pustą listę.
Rozumiej budowlany slang i skróty: „szlifa”, „flex”, „gumówka” to szlifierka kątowa; „młot”, „młotowiertarka”, „hilti” to młot; „agregat” to agregat prądotwórczy; „niwela”, „niwelator”, „laser” to niwelator; „zagęszczarka”, „skoczek”, „żaba” to zagęszczarki; „wkrętarka”, „zakrętarka” to wkrętarki.
Nie wymyślaj narzędzi ani kodów spoza listy.`;

/** Strukturalne wyjście: odpowiedź modelu zawsze pasuje do tego schematu. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "site", "fromSite", "mentions"],
  properties: {
    kind: { type: "string", enum: [...PROPOSAL_KINDS] },
    site: { anyOf: [{ type: "string" }, { type: "null" }] },
    fromSite: { anyOf: [{ type: "string" }, { type: "null" }] },
    mentions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "quantity", "codes"],
        properties: {
          phrase: { type: "string" },
          quantity: { type: "integer" },
          codes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

interface ModelAnswer {
  kind: ProposalKind;
  site: string | null;
  fromSite: string | null;
  mentions: Mention[];
}

/**
 * Port interpretacji na Claude Haiku 4.5 (Anthropic API). Budowy dostaje pod krótkimi oznaczeniami
 * (B1, B2…), a narzędzia pod kodami, więc identyfikatory z bazy nie wychodzą poza serwer.
 */
export function createClaudeInterpreter({ apiKey }: { apiKey: string }): Interpreter {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  return {
    async interpret(request: InterpretRequest): Promise<Interpretation> {
      const refs = request.sites.map((site, index) => ({ ref: `B${index + 1}`, site }));
      const catalog = [
        "Budowy (oznaczenie | nazwa):",
        ...refs.map(({ ref, site }) => `${ref} | ${site.name}${site.mine ? " | moja" : ""}`),
        "",
        "Narzędzia (kod | nazwa | kategoria | gdzie jest):",
        ...request.tools.map((tool) => `${tool.code} | ${tool.name} | ${tool.category} | ${tool.location.name}`),
      ].join("\n");

      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM,
          messages: [{ role: "user", content: `${catalog}\n\nZdanie: ${request.text}` }],
          output_config: { format: { type: "json_schema", schema: SCHEMA } },
        });
      } catch (error) {
        throw new InterpretationFailedError("Anthropic API", { cause: error });
      }
      const text = response.content.find((block) => block.type === "text")?.text;
      if (response.stop_reason !== "end_turn" || !text) {
        throw new InterpretationFailedError(`Brak odpowiedzi modelu (${response.stop_reason})`);
      }

      const answer = JSON.parse(text) as ModelAnswer;
      const siteId = (ref: string | null) => refs.find((entry) => entry.ref === ref)?.site.id ?? null;
      return {
        kind: PROPOSAL_KINDS.includes(answer.kind) ? answer.kind : "wydanie",
        siteId: siteId(answer.site),
        fromSiteId: siteId(answer.fromSite),
        mentions: answer.mentions,
      };
    },
  };
}
