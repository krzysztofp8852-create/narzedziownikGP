/** Alfabet kodu plakatu (Crockford): bez I, L, O i U, więc kod da się przepisać z plakatu. Ten sam losuje baza. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

/**
 * Kod plakatu z kodu QR albo wpisany ręcznie: wielkie litery, bez spacji i myślników, z literami mylonymi z cyframi
 * (O, I, L) zamienionymi tak jak w alfabecie Crockforda. null, gdy to nie może być kod plakatu.
 */
export function normalizePosterCode(raw: string): string | null {
  const code = String(raw ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return code.length === CODE_LENGTH && [...code].every((char) => ALPHABET.includes(char)) ? code : null;
}
