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
