import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

/** Nowa firma, tak jak zakłada ją GP Engineering: właściciel ma tylko hasło tymczasowe. */
function createCompany() {
  const email = `smoke-${randomUUID().slice(0, 8)}@narzedziownik.test`;
  const name = `Test dymny samouczka ${new Date().toISOString().slice(0, 16)}`;
  const output = execFileSync(
    "npx",
    ["tsx", "--env-file-if-exists=.env.local", "scripts/create-company.mts", "--name", name, "--owner-email", email, "--owner-name", "Jan Testowy", "--json"],
    { encoding: "utf8" },
  );
  const { temporaryPassword } = JSON.parse(output.trim().split("\n").at(-1)!) as { temporaryPassword: string };
  return { name, email, temporaryPassword };
}

/** Firma z kierownikiem, budową Rataje i narzędziami, bez wydrukowanych naklejek. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials };
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("po pierwszym logowaniu właściciel widzi pierwsze kroki; pominięty samouczek nie wraca sam, ale otwiera się z menu", async ({
  page,
}) => {
  const company = createCompany();
  await signIn(page, company.email, company.temporaryPassword);
  await expect(page).toHaveURL(/\/zmien-haslo$/);
  const newPassword = `Nowe-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(newPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(newPassword);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();

  await expect(page).toHaveURL(/\/$/);
  const tutorial = page.getByTestId("tutorial");
  await expect(tutorial.getByRole("heading", { name: "Pierwsze kroki" })).toBeVisible();
  await expect(tutorial.getByTestId("tutorial-progress")).toHaveText("Zrobione: 0 z 4");

  await tutorial.getByRole("button", { name: "Pomiń samouczek" }).click();
  await expect(page.getByTestId("tutorial")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Gdzie jest co" })).toBeVisible();
  await expect(page.getByTestId("tutorial")).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Samouczek" }).click();
  await expect(page).toHaveURL(/\/samouczek$/);
  await expect(page.getByTestId("tutorial").getByRole("heading", { name: "Pierwsze kroki" })).toBeVisible();
  await page.getByTestId("tutorial").getByRole("button", { name: "Gotowe" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("tutorial")).toHaveCount(0);
});

test("pierwsze kroki właściciela pokazują, co już jest w firmie, a kierownik przechodzi samouczek zapisu ruchu", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner.email, company.owner.password);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  const tutorial = page.getByTestId("tutorial");
  await expect(tutorial.getByTestId("tutorial-progress")).toHaveText("Zrobione: 3 z 4");
  await expect(tutorial.getByTestId("first-step-kierownik")).toHaveAttribute("data-done", "true");
  await expect(tutorial.getByTestId("first-step-budowa")).toHaveAttribute("data-done", "true");
  await expect(tutorial.getByTestId("first-step-narzedzia")).toHaveAttribute("data-done", "true");
  await expect(tutorial.getByTestId("first-step-naklejki")).toHaveAttribute("data-done", "false");
  await tutorial.getByRole("link", { name: "Przejdź do naklejek →" }).click();
  await expect(page).toHaveURL(/\/naklejki$/);

  await page.getByRole("button", { name: "Menu" }).click();

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager.email, company.manager.password);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  const guide = page.getByTestId("tutorial");
  await expect(guide.getByRole("heading", { name: "Ruchy na Twoich budowach" })).toBeVisible();
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  const movementCount = await recent.locator("li").count();
  await guide.getByRole("button", { name: "Dalej" }).click();
  await expect(guide.getByRole("heading", { name: "Wydanie z bazy" })).toBeVisible();
  await guide.getByRole("button", { name: "Wstecz" }).click();
  await expect(guide.getByRole("heading", { name: "Ruchy na Twoich budowach" })).toBeVisible();
  for (const heading of ["Wydanie z bazy", "Zwrot na bazę", "Przeniesienie", "Podsumowanie przed zapisem", "Cofnięcie w ciągu 15 minut", "Skaner QR"]) {
    await guide.getByRole("button", { name: "Dalej" }).click();
    await expect(guide.getByRole("heading", { name: heading })).toBeVisible();
  }
  // Dalej aż do końca: głos albo tekst zależą od konfiguracji.
  while (await guide.getByRole("button", { name: "Dalej" }).isVisible()) await guide.getByRole("button", { name: "Dalej" }).click();
  await expect(guide.getByRole("heading", { name: "Gotowe" })).toBeVisible();
  await guide.getByRole("button", { name: "Gotowe" }).click();
  await expect(page.getByTestId("tutorial")).toHaveCount(0);
  // Samouczek niczego nie zapisał.
  await expect(recent.locator("li")).toHaveCount(movementCount);
});
