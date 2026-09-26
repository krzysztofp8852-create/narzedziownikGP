import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Bez dostawcy transkrypcji nagrywanie jest wyłączone; test dymny „mówi” stałym tekstem (TRANSCRIPTION_PROVIDER=staly).
test.skip(
  process.env.TRANSCRIPTION_PROVIDER !== "staly" || process.env.TRANSCRIPTION_FIXED_TEXT !== "biorę dwie szlifierki na Rataje",
  "nagrywanie bez stałego tekstu transkrypcji",
);

// Chromium z udawanym mikrofonem (sygnał testowy) i zgodą na mikrofon bez pytania.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone"],
});

function tsx(script: string, ...args: string[]) {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script, ...args], { encoding: "utf8" });
  return output.trim().split("\n").at(-1)!;
}

test("kierownik przytrzymuje przycisk i mówi: dostaje propozycję z rozpoznanym tekstem, a nagranie znika z kubełka", async ({ page }) => {
  const company = JSON.parse(tsx("e2e/support/seed-checklist.mts")) as { companyId: string; companyName: string; email: string; password: string };

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: "Powiedz lub wpisz" }).click();
  const hold = page.getByRole("button", { name: /Przytrzymaj i mów/ });
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByRole("button", { name: /Mów… puść, gdy skończysz/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.mouse.up();

  await expect(page.getByText("Ty, głosem")).toBeVisible();
  await expect(page.locator(".bubble-you")).toContainText("biorę dwie szlifierki na Rataje");
  const proposal = page.getByRole("form", { name: "Propozycja ruchu" });
  await expect(proposal.getByRole("group", { name: "Które: „dwie szlifierki”? Wybierz 2." })).toBeVisible();
  expect(tsx("e2e/support/count-recordings.mts", company.companyId)).toBe("0");

  await proposal.getByRole("button", { name: "S-01 Szlifierka kątowa" }).click();
  await proposal.getByRole("button", { name: "S-02 Szlifierka mała" }).click();
  await proposal.getByRole("button", { name: "Zatwierdź ✓" }).click();

  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01, S-02 → Rataje");
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Słowami: „biorę dwie szlifierki na Rataje”");
});
