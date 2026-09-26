import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

function seedCompanies() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-stickers.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { owner: Credentials; otherOwner: Credentials; toolId: string };
}

async function signIn(page: Page, { email, password }: Credentials) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("adres z naklejki QR bez logowania prowadzi do logowania, a po nim do karty; innej firmie nic nie pokazuje", async ({ page }) => {
  const { owner, otherOwner, toolId } = seedCompanies();
  const stickerPath = `/narzedzia/${toolId}`;

  await page.goto(stickerPath);
  await expect(page).toHaveURL(/\/logowanie\?next=/);
  await expect(page.locator("body")).not.toContainText("H-01");
  await signIn(page, owner);
  await expect(page).toHaveURL(stickerPath);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("H-01 Młot Hilti");

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, otherOwner);
  await expect(page.getByTestId("company-name")).toBeVisible();
  await page.goto(stickerPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
  await expect(page.locator("body")).not.toContainText("H-01");
  await expect(page.locator("body")).not.toContainText("Młot Hilti");
});

test("właściciel pobiera PDF z naklejkami nieoklejonych narzędzi, a potem już żadne nie jest nieoklejone", async ({ page }) => {
  const { owner } = seedCompanies();

  await page.goto("/naklejki");
  await signIn(page, owner);
  await expect(page).toHaveURL(/\/naklejki$/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz PDF: wszystkie nieoklejone (1 szt.)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^naklejki-\d{4}-\d{2}-\d{2}\.pdf$/);
  await expect(page.getByRole("status")).toContainText("Pobrano PDF z naklejkami: 1 szt.");
  await expect(page.getByText("Wszystkie narzędzia w obiegu mają już wydrukowane naklejki.")).toBeVisible();
});
