import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { appNav, moreButton, openFromNav, openMyAccount, signOut } from "./support/navigation";

interface Credentials {
  login: string;
  password: string;
}

interface Seeded {
  companyName: string;
  owner: Credentials;
  manager: Credentials;
  storekeeper: Credentials;
  worker: Credentials;
}

/** Firma z właścicielem, kierownikiem budowy Rataje, magazynierem, pracownikiem i jednym narzędziem na bazie. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-navigation.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, { login, password }: Credentials, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

/** Pasek (odnośniki i „Więcej”), a po rozwinięciu „Więcej” to, co pod nim. Na koniec „Więcej” znowu zwinięte. */
async function expectNav(page: Page, bar: string[], more: string[]) {
  await expect(appNav(page).getByRole("link")).toHaveText(bar.slice(0, -1));
  await expect(moreButton(page)).toHaveText(bar.at(-1)!);
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");
  await moreButton(page).click();
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(appNav(page).getByRole("link")).toHaveText([...bar.slice(0, -1), ...more]);
  await moreButton(page).click();
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");
}

const OWNER_BAR = ["Tablica", "Narzędzia", "Skanuj", "Budowy", "Więcej"];
const OWNER_MORE = ["Pojazdy", "Terminy", "Historia", "Koszty sprzętu", "Ludzie", "Czas na budowie", "Raporty", "Naklejki", "Ustawienia", "Pomoc"];
const MANAGER_BAR = ["Tablica", "Moje budowy", "Skanuj", "Ludzie", "Więcej"];
const MANAGER_MORE = ["Narzędzia", "Pojazdy", "Terminy", "Historia", "Czas na budowie", "Raporty", "Pomoc"];
const STOREKEEPER_BAR = ["Tablica", "Narzędzia", "Skanuj", "Terminy", "Więcej"];
const STOREKEEPER_MORE = ["Budowy", "Pojazdy", "Historia", "Moje uprawnienia", "Mój czas na budowie", "Pomoc"];
const WORKER_BAR = ["Tablica", "Skanuj", "Zgłoś", "Moje"];
const WORKER_MORE = ["Moje uprawnienia", "Mój czas na budowie"];

test.describe("telefon: dolny pasek", () => {
  test("właściciel ma pasek z wyróżnionym Skanuj, „Więcej” w grupach jako arkusz nad paskiem, a w nagłówku szukaj, dzwonek i swoje imię", async ({
    page,
  }) => {
    const company = seedCompany();
    await signIn(page, company.owner, company.companyName);

    // Nagłówek: szukaj, zgłoszenia (do skrzynki), dzwonek i Moje konto; bez menu pod trzema kreskami i bez czatu.
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Szukaj narzędzia" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Zgłoszenia" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Dzwonek" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Moje konto: Jan Testowy" })).toHaveText("Jan");
    await expect(header.getByRole("button", { name: "Menu" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: /Czat/ })).toHaveCount(0);

    // Pasek przyklejony do dołu ekranu, na całą szerokość.
    const viewport = page.viewportSize()!;
    const box = (await appNav(page).boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    expect(Math.round(box.width)).toBe(viewport.width);
    await expect(appNav(page).getByRole("link", { name: "Tablica" })).toHaveAttribute("aria-current", "page");

    await expectNav(page, OWNER_BAR, OWNER_MORE);
    for (const group of ["Sprzęt", "Ludzie", "Firma"]) {
      await moreButton(page).click();
      await expect(appNav(page).getByRole("list", { name: group })).toBeVisible();
      await moreButton(page).click();
    }

    // Arkusz zamykają Escape (fokus wraca na przycisk), kliknięcie obok i wyjście klawiszem Tab; otwarty nie poszerza strony.
    await moreButton(page).click();
    await expect(appNav(page).getByRole("link", { name: "Pojazdy" })).toBeFocused();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await expect(appNav(page).getByRole("link", { name: "Pojazdy" })).toBeHidden();
    await expect(moreButton(page)).toBeFocused();
    await moreButton(page).click();
    await page.getByRole("heading", { name: "Gdzie jest co" }).click();
    await expect(appNav(page).getByRole("link", { name: "Pojazdy" })).toBeHidden();
    await moreButton(page).click();
    await appNav(page).getByRole("link", { name: "Pomoc" }).focus();
    await page.keyboard.press("Tab");
    await expect(appNav(page).getByRole("link", { name: "Pojazdy" })).toBeHidden();

    // Pozycja paska jest bieżąca na swojej stronie.
    await openFromNav(page, "Narzędzia");
    await expect(page).toHaveURL(/\/narzedzia$/);
    await expect(appNav(page).getByRole("link", { name: "Narzędzia" })).toHaveAttribute("aria-current", "page");
    await expect(appNav(page).getByRole("link", { name: "Tablica" })).not.toHaveAttribute("aria-current", "page");

    // Strona spod „Więcej”: arkusz zamyka się po przejściu, a „Więcej” i sama pozycja są oznaczone jako bieżące.
    await openFromNav(page, "Historia");
    await expect(page).toHaveURL(/\/historia$/);
    await expect(appNav(page).getByRole("link", { name: "Historia" })).toBeHidden();
    await expect(moreButton(page)).toHaveAttribute("data-current", "true");
    await moreButton(page).click();
    await expect(appNav(page).getByRole("link", { name: "Historia" })).toHaveAttribute("aria-current", "page");

    // Przycisk wstecz działa jak dotąd: wraca na poprzednią stronę i zamyka arkusz.
    await page.goBack();
    await expect(page).toHaveURL(/\/narzedzia$/);
    await expect(appNav(page).getByRole("link", { name: "Historia" })).toBeHidden();

    // Skanuj otwiera skaner ruchów na tablicy, także drugi raz po zamknięciu.
    await appNav(page).getByRole("link", { name: "Skanuj" }).click();
    await expect(page.getByRole("button", { name: "Skanuj QR" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Kod z naklejki")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: "Skanuj QR" }).click();
    await expect(page.getByLabel("Kod z naklejki")).toBeHidden();
    await appNav(page).getByRole("link", { name: "Skanuj" }).click();
    await expect(page.getByLabel("Kod z naklejki")).toBeVisible();

    // Pomoc: czat z obsługą i samouczek.
    await openFromNav(page, "Pomoc");
    await expect(page).toHaveURL(/\/pomoc\?ekran=/);
    await expect(page.getByRole("heading", { name: "Pomoc", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Otwórz czat" })).toHaveAttribute("href", "/czat/otworz?ekran=%2F");
    await expect(page.getByRole("link", { name: "Otwórz samouczek" })).toBeVisible();

    // Moje konto: język, hasło przez link w e-mailu, informacja o usunięciu konta i wylogowanie.
    await openMyAccount(page);
    await expect(page.getByRole("heading", { name: "Moje konto", level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Jan Testowy · Właściciel");
    for (const section of ["Język", "Hasło", "Usunięcie konta", "Wylogowanie"]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Wyślij link do zmiany hasła" })).toBeVisible();
    await page.getByRole("link", { name: "Jak usunąć konto i dane" }).click();
    await expect(page).toHaveURL(/\/usun-konto$/);
    await page.goBack();
    await signOut(page);
  });

  test("kierownik i magazynier mają swój pasek, a samouczek ekran po ekranie otwierają z Pomocy, bo nie startuje sam", async ({ page }) => {
    const company = seedCompany();

    await signIn(page, company.manager, company.companyName);
    await expect(page.getByRole("heading", { name: "Gdzie jest co" })).toBeVisible();
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
    await expectNav(page, MANAGER_BAR, MANAGER_MORE);
    await appNav(page).getByRole("link", { name: "Skanuj" }).click();
    await expect(page.getByLabel("Kod z naklejki")).toBeVisible();
    await openFromNav(page, "Ludzie");
    await expect(page).toHaveURL(/\/ludzie$/);
    await expect(appNav(page).getByRole("link", { name: "Ludzie" })).toHaveAttribute("aria-current", "page");
    await openFromNav(page, "Pomoc");
    await page.getByRole("link", { name: "Otwórz samouczek" }).click();
    await expect(page.getByTestId("tutorial").getByRole("heading", { name: "Ruchy na Twoich budowach" })).toBeVisible();
    await signOut(page);

    await signIn(page, company.storekeeper, company.companyName);
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
    await expectNav(page, STOREKEEPER_BAR, STOREKEEPER_MORE);
    await openFromNav(page, "Terminy");
    await expect(page).toHaveURL(/\/terminy$/);
    await openFromNav(page, "Moje uprawnienia");
    await expect(page).toHaveURL(/\/ludzie$/);
    await signOut(page);
  });

  test("pracownik ma tylko Tablicę, Skanuj, Zgłoś i Moje; Skanuj otwiera odbicie, a hasło nadaje mu właściciel", async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company.worker, company.companyName);
    await expectNav(page, WORKER_BAR, WORKER_MORE);

    await appNav(page).getByRole("link", { name: "Skanuj" }).click();
    await expect(page.getByRole("button", { name: "Odbij się" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Kod z plakatu")).toBeVisible();

    await openFromNav(page, "Zgłoś");
    await expect(page).toHaveURL(/\/zgloszenia\/nowe$/);
    await expect(appNav(page).getByRole("link", { name: "Zgłoś" })).toHaveAttribute("aria-current", "page");

    await openFromNav(page, "Mój czas na budowie");
    await expect(page).toHaveURL(/\/czas$/);
    await expect(moreButton(page)).toHaveAttribute("data-current", "true");

    // Bez czatu i samouczka pracownik nie ma Pomocy.
    await page.goto("/pomoc");
    await expect(page).toHaveURL(/\/$/);

    await openMyAccount(page);
    await expect(page.getByText("Nowe hasło nadaje właściciel firmy.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wyślij link do zmiany hasła" })).toHaveCount(0);
    await signOut(page);
  });
});

test.describe("komputer: panel boczny", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("każda rola ma te same pozycje w stałym panelu z boku, a „Więcej” rozwija się w nim i zostaje rozwinięte", async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company.owner, company.companyName);

    // Panel stoi z lewej, obok treści, a nie na dole ekranu.
    const nav = (await appNav(page).boundingBox())!;
    const main = (await page.getByRole("main").boundingBox())!;
    expect(nav.x + nav.width).toBeLessThanOrEqual(main.x + 1);
    expect(nav.y).toBeLessThan(main.y + 40);
    await expectNav(page, OWNER_BAR, OWNER_MORE);

    // Rozwinięte „Więcej” zostaje rozwinięte między stronami.
    await moreButton(page).click();
    await appNav(page).getByRole("link", { name: "Raporty" }).click();
    await expect(page).toHaveURL(/\/raporty$/);
    await expect(appNav(page).getByRole("link", { name: "Raporty" })).toHaveAttribute("aria-current", "page");
    await appNav(page).getByRole("link", { name: "Ustawienia" }).click();
    await expect(page).toHaveURL(/\/ustawienia$/);
    await expect(appNav(page).getByRole("link", { name: "Ustawienia" })).toHaveAttribute("aria-current", "page");

    // Na stronie spod „Więcej” otwartej wprost lista jest rozwinięta od razu.
    await page.goto("/historia");
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(appNav(page).getByRole("link", { name: "Historia" })).toHaveAttribute("aria-current", "page");
    await signOut(page);

    for (const [who, bar, more] of [
      [company.manager, MANAGER_BAR, MANAGER_MORE],
      [company.storekeeper, STOREKEEPER_BAR, STOREKEEPER_MORE],
      [company.worker, WORKER_BAR, WORKER_MORE],
    ] as const) {
      await signIn(page, who, company.companyName);
      await expectNav(page, [...bar], [...more]);
      await signOut(page);
    }
  });
});

test("przewodnik po tablicy demo wskazuje „Więcej” w dolnym pasku", async ({ page }) => {
  await page.goto("/demo");
  const enter = page.getByRole("button", { name: "Wejdź jako właściciel" });
  test.skip(await enter.isDisabled(), "W tej bazie nie założono demo (npm run demo:create)");
  await enter.click();
  await expect(page.getByTestId("company-name")).toBeVisible();

  const tour = page.getByTestId("demo-tour");
  await expect(tour).toBeVisible();
  for (let step = 0; step < 20 && !(await tour.getByRole("heading", { name: "Więcej" }).isVisible()); step++) {
    await tour.getByRole("button", { name: "Dalej" }).click();
  }
  await expect(tour.getByRole("heading", { name: "Więcej" })).toBeVisible();

  // Pierścień otacza przycisk w pasku, a dymek stoi nad nim, żeby go nie zasłonić.
  await expect
    .poll(async () => {
      const button = await moreButton(page).boundingBox();
      const ring = await page.locator(".demo-tour-ring").boundingBox();
      const card = await tour.boundingBox();
      if (!button || !ring || !card) return false;
      const center = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
      const ringed = center.x > ring.x && center.x < ring.x + ring.width && center.y > ring.y && center.y < ring.y + ring.height;
      return ringed && card.y + card.height < button.y;
    })
    .toBe(true);
});
