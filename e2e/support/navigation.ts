import { expect, type Page } from "@playwright/test";

/** Nawigacja konta: dolny pasek na telefonie, panel boczny na komputerze (ten sam element). */
export const appNav = (page: Page) => page.getByRole("navigation", { name: "Nawigacja" });

/** „Więcej” w nawigacji; u pracownika ten przycisk nazywa się „Moje”. */
export const moreButton = (page: Page) => appNav(page).getByRole("button", { name: /^(Więcej|Moje)$/ });

/** Przejście na stronę z nawigacji: z paska albo spod „Więcej”, które najpierw się otwiera. */
export async function openFromNav(page: Page, label: string) {
  const link = appNav(page).getByRole("link", { name: label, exact: true });
  if (!(await link.isVisible())) await moreButton(page).click();
  await link.click();
}

/** Moje konto: klik w swoje imię w nagłówku. */
export async function openMyAccount(page: Page) {
  await page.getByRole("banner").getByRole("link", { name: /^Moje konto: / }).click();
  await expect(page).toHaveURL(/\/konto$/);
}

/** Wylogowanie z Mojego konta. */
export async function signOut(page: Page) {
  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
}
