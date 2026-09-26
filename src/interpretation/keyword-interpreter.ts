import type { Interpretation, InterpretRequest, Interpreter, Mention } from "./interpretation";

const NUMBERS: Record<string, number> = {
  jeden: 1, jedna: 1, jedną: 1, jedno: 1, dwa: 2, dwie: 2, dwóch: 2, parę: 2, trzy: 3, trzech: 3, cztery: 4, pięć: 5,
};

/** Początek słowa, po którym poznajemy odmienione formy: „szlifierki” i „szlifierkę” to „szlif”. */
function stem(word: string) {
  return word.toLowerCase().slice(0, Math.min(5, Math.max(3, word.length - 1)));
}

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [];
}

/**
 * Port interpretacji bez AI: słowa kluczowe, kody i liczebniki. Do pracy lokalnej i testu dymnego,
 * gdy nie ma klucza Anthropic API; slangu ani składni nie rozumie.
 */
export const keywordInterpreter: Interpreter = {
  async interpret({ text, tools, sites }: InterpretRequest): Promise<Interpretation> {
    const said = words(text);
    const kind = said.some((word) => /^(oddaj|zwrac|zwrot)/.test(word))
      ? "zwrot"
      : said.some((word) => /^(przenos|przenie|przejm)/.test(word))
        ? "przeniesienie"
        : "wydanie";
    const site = sites.find((candidate) => said.some((word) => word.length > 3 && stem(word) === stem(candidate.name)));

    const mentions: Mention[] = [];
    said.forEach((word, index) => {
      const bare = word.replace(/-/g, "").toUpperCase();
      const byCode = tools.filter((tool) => tool.code.replace(/-/g, "") === bare);
      const byName =
        word.length > 3 && !NUMBERS[word]
          ? tools.filter((tool) => [...words(tool.name), ...words(tool.category)].some((known) => stem(known) === stem(word)))
          : [];
      const matching = byCode.length > 0 ? byCode : byName;
      if (matching.length === 0) return;
      const numeral = NUMBERS[said[index - 1]] ?? Number(said[index - 1]);
      const quantity = Number.isInteger(numeral) && numeral > 0 ? numeral : 1;
      mentions.push({
        phrase: quantity > 1 || NUMBERS[said[index - 1]] ? `${said[index - 1]} ${word}` : word,
        quantity,
        codes: matching.map((tool) => tool.code),
      });
    });
    return { kind, siteId: site?.id ?? null, fromSiteId: null, mentions };
  },
};
