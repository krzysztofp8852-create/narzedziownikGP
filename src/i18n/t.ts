import pl from "../../messages/pl.json";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof pl>;

/** Tekst interfejsu z pliku tłumaczeń. `{nazwa}` w tekście zastępuje `params.nazwa`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], pl);
  if (typeof text !== "string") throw new Error(`Brak tłumaczenia: ${key}`);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
