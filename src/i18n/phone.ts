/**
 * Numer telefonu do wyświetlenia: polski w grupach po trzy cyfry („+48 608 177 748”, „608 177 748”). Innego
 * formatu nie zgadujemy i zostawiamy go, jak jest.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  const match = /^(\+48)?(\d{3})(\d{3})(\d{3})$/.exec(digits);
  if (!match) return raw.trim();
  const [, prefix, ...groups] = match;
  return [prefix, ...groups].filter(Boolean).join(" ");
}

/** Numer do odnośnika `tel:`: same cyfry i plus. */
export function phoneHref(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
}
