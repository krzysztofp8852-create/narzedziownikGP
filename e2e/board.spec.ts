import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { equipmentAt, placeTile } from "./support/equipment";
import { signOut } from "./support/navigation";

interface Credentials {
  email: string;
  password: string;
}

/**
 * Firma z budową Rataje (H-01 3200 zł i S-01 450,50 zł) i S-02 (380 zł) na bazie, kierownikiem, magazynierem i wiertarką
 * zgłoszoną przez kierownika do akceptacji.
 */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts", "--tablica"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials; storekeeper: Credentials };
}

async function signIn(page: Page, { email, password }: Credentials, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

const operations = (page: Page) => page.getByRole("region", { name: "Operacje" });
const operationButtons = (page: Page) => operations(page).locator(".operation-tabs").first().getByRole("button");
const counters = (page: Page) => page.getByRole("list", { name: "Liczniki sprzętu" }).getByRole("link");
const where = (page: Page) => page.getByRole("region", { name: "Gdzie jest sprzęt" });

/** Na wierzchu: Wydaj, Zwróć, Powiedz lub wpisz (gdy serwer ma dostawcę AI) i „Więcej operacji”. */
async function expectTopOperations(page: Page) {
  await expect(operationButtons(page).last()).toHaveText("Więcej operacji");
  const texts = await operationButtons(page).allTextContents();
  const textEntry = texts.length === 4 ? [expect.stringMatching(/^(Powiedz lub wpisz|Wpisz tekstem)$/)] : [];
  expect(texts).toEqual(["Wydaj z bazy", "Zwróć na bazę", ...textEntry, "Więcej operacji"]);
}

async function moreOperations(page: Page) {
  await operations(page).getByRole("button", { name: "Więcej operacji" }).click();
  return operations(page).locator("#operations-more").getByRole("button");
}

/** Elementy stoją na ekranie jeden pod drugim w tej kolejności. */
async function expectTopToBottom(locators: Locator[]) {
  const tops: number[] = [];
  for (const locator of locators) tops.push((await locator.boundingBox())!.y);
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
}

/** Sekcji dawnej tablicy już nie ma: pełne listy, mapa, budowy i pojazdy do dodania, serwis, zaginione i banery. */
async function expectNoOldSections(page: Page) {
  for (const name of ["Budowa Rataje", "Baza Magazyn", "W serwisie", "Zaginione", "Mapa", "Pojazdy"]) {
    await expect(page.getByRole("region", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.locator("summary", { hasText: /Dodaj (budowę|pojazd)/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Zgłoszone narzędzia czekają/ })).toHaveCount(0);
  // Narzędzia są tylko w ostatnich ruchach; pełne listy mają strony miejsc.
  await expect(page.locator(".tool-row")).toHaveCount(0);
}

test.describe("telefon", () => {
  test("właściciel: pierwsze kroki, odbicie, operacje, sprawy, liczniki w zł, kafle i trzy ostatnie ruchy, a z kafla strona budowy", async ({
    page,
  }) => {
    const company = seedCompany();
    await signIn(page, company.owner, company.companyName);

    const tutorial = page.getByTestId("tutorial");
    const attention = page.getByRole("region", { name: "Wymaga uwagi" });
    const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
    await expect(tutorial.getByRole("heading", { name: "Uruchom firmę w 4 krokach" })).toBeVisible();
    await expect(page.getByTestId("punch-status")).toHaveText("Nie jesteś odbity");
    await expectTopToBottom([tutorial, page.getByTestId("punch-status"), operations(page), attention, counters(page).first(), where(page), recent]);

    await expectTopOperations(page);
    await expect(await moreOperations(page)).toHaveText(["Przenieś", "Do serwisu", "Z serwisu", "Dodaj narzędzie", "Sprzęt wynajęty"]);

    await expect(attention.getByRole("listitem").first()).toContainText("Wiertarka Makita");
    await expect(attention.getByRole("link", { name: /^Zobacz wszystkie \(\d+\)$/ })).toHaveAttribute("href", "/dzwonek");

    await expect(counters(page)).toHaveText([/^Na bazie\s+1$/, /^Na budowach\s+3$/, /^Alarmy\s+0$/, /^Poza bazą\s+3650,50\szł$/]);
    await expect(page.getByTestId("off-base-value")).toHaveText(/^3650,50\szł$/);

    await expect(where(page).getByRole("link")).toHaveText([/^\s*Baza\s+Magazyn\s+1 szt\.\s+380,00\szł\s*$/, /^\s*Budowa\s+Rataje\s+3 szt\.\s+3650,50\szł\s*$/]);
    // Tablica pokazuje najwyżej trzy ostatnie ruchy; resztę ma Cała historia.
    await expect(recent.getByRole("listitem")).toHaveCount(3);
    await expect(recent.getByRole("link", { name: "Cała historia →" })).toHaveAttribute("href", "/historia");
    await expectNoOldSections(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    // Licznik prowadzi do przefiltrowanej listy narzędzi.
    await counters(page).filter({ hasText: "Na budowach" }).click();
    await expect(page).toHaveURL(/\/narzedzia\?pokaz=na-budowach$/);
    await expect(page.getByRole("button", { name: /^Na budowach/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("tools-count")).toContainText("Narzędzia: 3");

    // Kafel prowadzi do strony budowy z pełną listą sprzętu.
    const rataje = await equipmentAt(page, "Rataje");
    await expect(page).toHaveURL(/\/budowy\/[0-9a-f-]{36}$/);
    await expect(rataje.getByRole("link", { name: /H-01/ })).toContainText("3200,00 zł");
  });

  test("kierownik: bez złotówek, „Zgłoś narzędzie” pod „Więcej operacji” i swoje budowy na siatce", async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company.manager, company.companyName);

    await expect(page.getByRole("heading", { name: "Tablica", level: 1 })).toBeVisible();
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
    await expectTopOperations(page);
    await expect(await moreOperations(page)).toHaveText(["Przenieś", "Do serwisu", "Zgłoś narzędzie", "Sprzęt wynajęty"]);
    await expect(counters(page)).toHaveText([/^Na bazie\s+1$/, /^Na budowach\s+3$/, /^Alarmy\s+0$/]);
    await expect(page.getByTestId("off-base-value")).toHaveCount(0);
    await expect(where(page).getByRole("link")).toHaveText([/^\s*Baza\s+Magazyn\s+1 szt\.\s*$/, /^\s*Budowa\s+Rataje\s+3 szt\.\s*$/]);
    await expect(page.locator("details.place-others")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("zł");
    await expectNoOldSections(page);

    await placeTile(page, "Rataje").click();
    await expect(page.getByRole("heading", { name: /Rataje/, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Sprzęt", exact: true }).getByRole("link", { name: /H-01/ })).toBeVisible();
    await signOut(page);
  });

  test("magazynier: Wydaj i Zwróć na wierzchu, Do serwisu, Z serwisu i Dodaj narzędzie pod „Więcej operacji”, bez złotówek", async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company.storekeeper, company.companyName);

    await expect(page.getByTestId("tutorial")).toHaveCount(0);
    await expectTopOperations(page);
    await expect(await moreOperations(page)).toHaveText(["Przenieś", "Do serwisu", "Z serwisu", "Dodaj narzędzie", "Sprzęt wynajęty"]);
    await expect(counters(page)).toHaveText([/^Na bazie\s+1$/, /^Na budowach\s+3$/, /^Alarmy\s+0$/]);
    await expect(page.locator("main")).not.toContainText("zł");
    await expectNoOldSections(page);
  });
});

test.describe("komputer", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("właściciel ma operacje i ostatnie ruchy w lewej kolumnie, a sprawy, liczniki i kafle obok", async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company.owner, company.companyName);

    const side = [operations(page), page.getByRole("region", { name: "Ostatnie ruchy" })];
    const main = [page.getByRole("region", { name: "Wymaga uwagi" }), counters(page).first(), where(page)];
    await expectTopToBottom(side);
    await expectTopToBottom(main);
    const sideRight = Math.max(...(await Promise.all(side.map(async (locator) => (await locator.boundingBox())!))).map((box) => box.x + box.width));
    for (const locator of main) expect((await locator.boundingBox())!.x).toBeGreaterThanOrEqual(sideRight);

    await expectTopOperations(page);
    await expect(counters(page)).toHaveCount(4);
    await expect(where(page).getByRole("link")).toHaveCount(2);
    await expectNoOldSections(page);
  });
});
