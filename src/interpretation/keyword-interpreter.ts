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
 * Port interpretacji bez AI: słowa kluczowe, kody, liczebniki i „wszystko”. Do pracy lokalnej i testu dymnego,
 * gdy nie ma klucza OpenAI API; slangu ani składni nie rozumie.
 */
export const keywordInterpreter: Interpreter = {
  async interpret({ text, tools, sites, services }: InterpretRequest): Promise<Interpretation> {
    const said = words(text);
    const service = said.findIndex((word) => /^serwis/.test(word) || /^napraw/.test(word));
    // Budowy w kolejności ze zdania; „z …” przed nazwą to budowa, z której sprzęt jest zabierany.
    const named = said.flatMap((word, index) => {
      const site = word.length > 3 && sites.find((candidate) => stem(word) === stem(candidate.name));
      return site ? [{ site, from: ["z", "ze"].includes(said[index - 1]) }] : [];
    });
    const kind =
      service >= 0
        ? ["z", "ze"].includes(said[service - 1])
          ? "z_serwisu"
          : "do_serwisu"
        : said.some((word) => /^(oddaj|zwrac|zwrot)/.test(word))
          ? "zwrot"
          : said.some((word) => /^(przenos|przenie|przejm)/.test(word)) || new Set(named.map((entry) => entry.site.id)).size > 1
            ? "przeniesienie"
            : "wydanie";
    const fromSite = kind === "przeniesienie" ? named.find((entry) => entry.from) : undefined;
    const site = named.find((entry) => entry !== fromSite && entry.site.id !== fromSite?.site.id);
    // Przy serwisie słowo „serwis” i słowa z nazwy serwisu („Hilti” w „Serwis Hilti”) to serwis, a nie narzędzie.
    const serviceWords = new Set(
      service < 0
        ? []
        : said.flatMap((word, index) =>
            index === service ||
            (word.length > 3 && services.some((candidate) => words(candidate.name).some((known) => known.length > 3 && stem(known) === stem(word))))
              ? [index]
              : [],
          ),
    );
    const namedService = services.find((candidate) =>
      words(candidate.name).some((known) => known.length > 3 && !/^serwis/.test(known) && said.some((word) => stem(word) === stem(known))),
    );
    const everything = said.some((word) => /^(wszystk|cał[aąeoy])/.test(word));

    const mentions: Mention[] = [];
    said.forEach((word, index) => {
      const bare = word.replace(/-/g, "").toUpperCase();
      const byCode = tools.filter((tool) => tool.code.replace(/-/g, "") === bare);
      const byName =
        word.length > 3 && !NUMBERS[word] && !serviceWords.has(index)
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
    return {
      kind,
      siteId: kind === "z_serwisu" ? null : (site?.site.id ?? null),
      fromSiteId: fromSite?.site.id ?? null,
      serviceId: namedService?.id ?? null,
      everything,
      mentions: everything ? [] : mentions,
    };
  },
};
