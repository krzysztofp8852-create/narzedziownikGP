import "server-only";
import OpenAI from "openai";
import { type Interpretation, InterpretationFailedError, type InterpretRequest, type Interpreter, type Mention } from "./interpretation";
import { PROPOSAL_KINDS, type ProposalKind } from "./proposal";

/** Domyślny model interpretacji: szybki i tani, ze strukturalnym wyjściem. Zmienia go `OPENAI_MODEL`. */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const SYSTEM = `Jesteś częścią aplikacji do ewidencji narzędzi małej firmy budowlanej w Polsce.
Kierownik budowy albo magazynier pisze jedno zdanie o tym, co zabiera lub oddaje, np. „biorę dwie szlifierki i młot na Rataje”, albo pyta, gdzie jest sprzęt, np. „gdzie jest niwelator?”.
Twoje zadanie: zrozumieć zdanie i dopasować je do narzędzi i budów firmy. Nic nie zapisujesz; człowiek zatwierdzi wynik.

Rodzaj ruchu (kind):
- "wydanie": sprzęt z bazy (magazynu) na budowę („biorę”, „wydaj”, „zabieram z bazy”, „na Rataje”).
- "zwrot": sprzęt z budowy na bazę („oddaję”, „zwracam”, „odwożę na bazę”, „wraca na magazyn”).
- "przeniesienie": sprzęt z jednej budowy na drugą („zabieram z Winograd na Rataje”, „przejmuję z Łazarza”).
- "do_serwisu": sprzęt do naprawy, z budowy albo z bazy do serwisu („wysyłam do serwisu”, „oddaję do naprawy”, „wiozę do Hilti na przegląd”).
- "z_serwisu": sprzęt odebrany z serwisu na bazę („odbieram z serwisu”, „wraca z naprawy”, „przywiozłem z serwisu”).
Gdy zdanie nie przesądza, wybierz "wydanie".

Budowy (site, fromSite) podawaj wyłącznie jako oznaczenie z listy (np. "B2"), nigdy nazwą:
- site: budowa, na którą trafia sprzęt przy wydaniu i przeniesieniu, albo z której wraca przy zwrocie. Null, gdy nie padła. Słowa „moja budowa”, „do mnie” oznaczają budowę oznaczoną jako moja, jeśli jest jedna.
- site przy "do_serwisu": budowa, z której sprzęt jedzie do serwisu; null, gdy jedzie z bazy albo budowa nie padła. Przy "z_serwisu" zawsze null.
- fromSite: tylko przy przeniesieniu, budowa, z której sprzęt jest zabierany, jeśli padła w zdaniu; inaczej null.
- service: tylko przy "do_serwisu" i "z_serwisu", serwis z listy (oznaczenie, np. "SE1"), do którego sprzęt jedzie albo z którego wraca, jeśli padł w zdaniu; inaczej null.
Rozpoznawaj odmianę i skróty nazw („z Rataj”, „na Winogradach”, „Łazarz” → „Łazarzu”).

Pytanie (question): true, gdy zdanie nie opisuje ruchu, tylko pyta, gdzie jest sprzęt albo kto go ma („gdzie jest niwelator?”, „gdzie są szlifierki”, „kto ma młot Hilti”, „szukam agregatu”). Wtedy mentions to narzędzia, o które pyta, z tymi samymi zasadami co przy ruchu (np. „duży flex” to tylko szlifierki 230 mm), kind "wydanie", site, fromSite i service null, everything false. Zdanie z budową, na którą albo z której jedzie sprzęt, to ruch także bez czasownika („na moją budowę agregat”): false.

Wszystko (everything): true, gdy ruch dotyczy całego sprzętu z miejsca, skąd jest zabierany, a nie wymienionych narzędzi („zabieram wszystko z Winograd na Rataje”, „oddaję cały sprzęt z Rataj”, „zjeżdżam ze wszystkim z Łazarza”, „odbieram wszystko z serwisu”). Wtedy mentions to pusta lista. Inaczej false.

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
  required: ["question", "kind", "site", "fromSite", "service", "everything", "mentions"],
  properties: {
    question: { type: "boolean" },
    kind: { type: "string", enum: [...PROPOSAL_KINDS] },
    site: { anyOf: [{ type: "string" }, { type: "null" }] },
    fromSite: { anyOf: [{ type: "string" }, { type: "null" }] },
    service: { anyOf: [{ type: "string" }, { type: "null" }] },
    everything: { type: "boolean" },
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
  question: boolean;
  kind: ProposalKind;
  site: string | null;
  fromSite: string | null;
  service: string | null;
  everything: boolean;
  mentions: Mention[];
}

/**
 * Port interpretacji na OpenAI (Responses API ze strukturalnym wyjściem). Budowy i serwisy dostaje pod krótkimi
 * oznaczeniami (B1, B2…, SE1, SE2…), a narzędzia pod kodami, więc identyfikatory z bazy nie wychodzą poza serwer.
 * Odpowiedzi nie są przechowywane u dostawcy (`store: false`).
 */
export function createOpenAIInterpreter({ apiKey, model }: { apiKey: string; model: string }): Interpreter {
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  return {
    async interpret(request: InterpretRequest): Promise<Interpretation> {
      const refs = request.sites.map((site, index) => ({ ref: `B${index + 1}`, site }));
      const serviceRefs = request.services.map((service, index) => ({ ref: `SE${index + 1}`, service }));
      const catalog = [
        "Budowy (oznaczenie | nazwa):",
        ...refs.map(({ ref, site }) => `${ref} | ${site.name}${site.mine ? " | moja" : ""}`),
        "",
        "Serwisy (oznaczenie | nazwa):",
        ...serviceRefs.map(({ ref, service }) => `${ref} | ${service.name}`),
        "",
        "Narzędzia (kod | nazwa | kategoria | gdzie jest):",
        ...request.tools.map((tool) => `${tool.code} | ${tool.name} | ${tool.category} | ${tool.location.name}`),
      ].join("\n");

      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create({
          model,
          instructions: SYSTEM,
          input: `${catalog}\n\nZdanie: ${request.text}`,
          text: { format: { type: "json_schema", name: "propozycja_ruchu", schema: SCHEMA, strict: true } },
          // Modele z rozumowaniem: dopasowanie fraz nie wymaga długiego namysłu, a kierownik czeka.
          ...(model.startsWith("gpt-5") && { reasoning: { effort: "low" as const } }),
          max_output_tokens: 4096,
          store: false,
        });
      } catch (error) {
        throw new InterpretationFailedError("OpenAI API", { cause: error });
      }
      const refused = response.output.some(
        (item) => item.type === "message" && item.content.some((content) => content.type === "refusal"),
      );
      if (response.status !== "completed" || refused || !response.output_text) {
        throw new InterpretationFailedError(
          `Brak odpowiedzi modelu (${refused ? "odmowa" : (response.incomplete_details?.reason ?? response.status)})`,
        );
      }

      const answer = JSON.parse(response.output_text) as ModelAnswer;
      const siteId = (ref: string | null) => refs.find((entry) => entry.ref === ref)?.site.id ?? null;
      return {
        kind: PROPOSAL_KINDS.includes(answer.kind) ? answer.kind : "wydanie",
        siteId: siteId(answer.site),
        fromSiteId: siteId(answer.fromSite),
        serviceId: serviceRefs.find((entry) => entry.ref === answer.service)?.service.id ?? null,
        everything: answer.everything && !answer.question,
        mentions: answer.everything && !answer.question ? [] : answer.mentions,
        whereIs: answer.question,
      };
    },
  };
}
