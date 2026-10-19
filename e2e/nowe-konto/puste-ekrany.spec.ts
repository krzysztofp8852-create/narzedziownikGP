import { type Page, test } from "@playwright/test";
import { addWorker, expect, secondPhone } from "../support/equipment";
import { firstSignIn, openFreshAccount } from "../support/fresh-account";

// Nowa firma przez interfejs, a potem drugi telefon pracownika: dwa pierwsze logowania z hasłem tymczasowym.
test.describe.configure({ timeout: 180_000 });

/** Pusty ekran ze zdaniem `text`: jedno zdanie, co tu będzie, i najwyżej jeden kolejny krok. */
function emptyState(page: Page, text: string) {
  return page.locator(".empty").filter({ hasText: text });
}

test("puste ekrany nowej firmy: właściciel ma przycisk z kolejnym krokiem, a pracownik zamiast niego dowiaduje się, kto może", async ({
  page,
  browser,
}, testInfo) => {
  const account = await openFreshAccount(page, "puste ekrany");

  // Budowy i Pojazdy: kafel dodawania stoi tuż pod zdaniem, więc pusty ekran nie dubluje go przyciskiem.
  await page.goto("/budowy");
  const noSites = emptyState(page, "Nie masz aktywnych budów. Dodaj nową poniżej.");
  await expect(noSites.getByRole("link")).toHaveCount(0);
  await expect(page.locator("details.location-add summary", { hasText: "Dodaj budowę" })).toBeVisible();
  await page.goto("/pojazdy");
  await expect(emptyState(page, "Firma nie ma jeszcze pojazdów.").getByRole("link")).toHaveCount(0);
  await expect(page.locator("details.location-add summary", { hasText: "Dodaj pojazd" })).toBeVisible();

  // Narzędzia: „Dodaj narzędzie” otwiera tę operację na tablicy, a adres wraca na samą tablicę.
  await page.goto("/narzedzia");
  const noTools = emptyState(page, "Firma nie ma jeszcze narzędzi.");
  await expect(noTools.getByRole("link")).toHaveText(["Dodaj narzędzie"]);
  await noTools.getByRole("link", { name: "Dodaj narzędzie" }).click();
  const operations = page.getByRole("region", { name: "Operacje" });
  await expect(operations.getByRole("button", { name: "Dodaj narzędzie", exact: true, expanded: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Naklejki bez narzędzi w obiegu prowadzą do tego samego kroku.
  await page.goto("/naklejki");
  await expect(emptyState(page, "Nie ma narzędzi w obiegu.").getByRole("link")).toHaveText(["Dodaj narzędzie"]);

  // Pracownik widzi te same puste ekrany bez przycisków, za to z informacją, kto może to zrobić.
  const username = `kowalczyk.${account.companyId.slice(0, 8)}`;
  const worker = await addWorker(page, { firstName: "Piotr", lastName: "Kowalczyk", username });
  const phone = await secondPhone(browser, testInfo);
  await firstSignIn(phone, worker.username, worker.temporaryPassword, account.companyName);

  const screens = [
    { path: "/budowy", text: "Firma nie ma aktywnych budów.", who: "Budowy dodaje właściciel." },
    { path: "/pojazdy", text: "Firma nie ma jeszcze pojazdów.", who: "Pojazdy dodaje właściciel." },
    { path: "/narzedzia", text: "Firma nie ma jeszcze narzędzi.", who: "Narzędzia dodaje właściciel lub magazynier." },
    { path: "/ludzie", text: "Nie masz jeszcze wpisanych uprawnień.", who: "Uprawnienia wpisuje właściciel lub kierownik." },
  ];
  for (const { path, text, who } of screens) {
    await phone.goto(path);
    const empty = emptyState(phone, text);
    await expect(empty).toContainText(who);
    await expect(empty.getByRole("link")).toHaveCount(0);
  }
  await phone.context().close();
});
