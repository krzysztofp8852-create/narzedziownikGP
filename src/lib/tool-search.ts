/** Małe litery, bez polskich znaków i bez kresek w kodach: „s01” znajdzie S-01, „szlifierka” Szlifierkę. */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

/** Czy narzędzie pasuje do wyszukiwania po nazwie albo kodzie. */
export function matchesTool(tool: { code: string; name: string }, query: string) {
  const wanted = normalize(query.trim());
  if (!wanted) return true;
  const bare = (text: string) => text.replace(/[^a-z0-9]/g, "");
  return normalize(tool.name).includes(wanted) || bare(normalize(tool.code)).includes(bare(wanted));
}
