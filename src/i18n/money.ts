const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

/** „3 200,00 zł”. */
export function formatMoney(amount: number): string {
  return money.format(amount);
}

const moneyChange = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", signDisplay: "exceptZero" });

/** „+1 500,00 zł”, „-450,50 zł”, „0,00 zł”. */
export function formatMoneyChange(amount: number): string {
  return moneyChange.format(amount);
}

const price = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0, useGrouping: "always" });

/** Cena w cenniku, w pełnych złotych: „300 zł”, „5 000 zł” (bez „always” Intl nie grupuje czterech cyfr). */
export function formatPrice(amount: number): string {
  return price.format(amount);
}
