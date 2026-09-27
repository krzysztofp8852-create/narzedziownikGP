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
  // Worker Playwrighta ma FORCE_COLOR=1; bez tego wyjście skryptu mogłoby zawierać kody kolorów.
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script, ...args], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return output.trim().split("\n").at(-1)!;
}

test("kierownik bez zasięgu nagrywa wiadomość: czeka w telefonie, a po powrocie sieci jest propozycja do zatwierdzenia", async ({ page, context }) => {
  const company = JSON.parse(tsx("e2e/support/seed-checklist.mts")) as { companyId: string; companyName: string; email: string; password: string };

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: "Powiedz lub wpisz" }).click();
  await context.setOffline(true);
  const hold = page.getByRole("button", { name: /Przytrzymaj i mów/ });
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByRole("button", { name: /Mów… puść, gdy skończysz/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.mouse.up();

  await expect(page.getByRole("status")).toContainText("Brak zasięgu. Nagranie jest w telefonie");
  await expect(page.getByTestId("pending-count")).toHaveText("⏳ Oczekuje: 1");

  await context.setOffline(false);

  // Powiadomienie w aplikacji: propozycja z nagrania czeka na zatwierdzenie, a nagrania nie ma już w kubełku.
  await expect(page.getByTestId("ready-recordings")).toHaveText("🎙 Do zatwierdzenia: 1");
  await expect(page.getByTestId("pending-count")).toHaveCount(0);
  expect(tsx("e2e/support/count-recordings.mts", company.companyId)).toBe("0");
  await page.getByTestId("ready-recordings").click();

  await expect(page.locator(".bubble-you")).toContainText("biorę dwie szlifierki na Rataje");
  await expect(page.locator(".bubble-you")).toContainText("Nagranie z");
  const proposal = page.getByRole("form", { name: "Propozycja ruchu" });
  await proposal.getByRole("button", { name: "S-01 Szlifierka kątowa" }).click();
  await proposal.getByRole("button", { name: "S-02 Szlifierka mała" }).click();
  await proposal.getByRole("button", { name: "Zatwierdź ✓" }).click();

  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01, S-02 → Rataje");
  await expect(page.getByTestId("ready-recordings")).toHaveCount(0);
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Słowami: „biorę dwie szlifierki na Rataje”");
});
