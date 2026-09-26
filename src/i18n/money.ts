const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

/** „3 200,00 zł”. */
export function formatMoney(amount: number): string {
  return money.format(amount);
}
