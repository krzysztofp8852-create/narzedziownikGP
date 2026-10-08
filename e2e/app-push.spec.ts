import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { emitPluginEvent, listensTo, pluginCalls, stubAppBridge } from "./support/app-bridge";

type BellCompany = { companyName: string; email: string; password: string; toolId: string };

function seedCompany(): BellCompany {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-bell.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as BellCompany;
}

function subscriptionsOf(email: string): { kind: string; token: string | null; endpoint: string | null }[] {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/push-subscriptions.mts", email], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

/** Wtyczka FCM w aplikacji na Androidzie 13+: zgody jeszcze nie ma, a Android da ją po zapytaniu. */
const PUSH = {
  checkPermissions: { receive: "prompt" },
  requestPermissions: { receive: "granted" },
  register: null,
  unregister: null,
};
const TOKEN = "telefon-kowalskiego:APA91bH_e2e";

const methods = async (page: Page) => (await pluginCalls(page, "PushNotifications")).map((call) => call.method);

async function logIn(page: Page, company: BellCompany) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
}

test("w aplikacji przełącznik push rejestruje token FCM, a Android pyta o zgodę dopiero przy włączeniu", async ({ page }) => {
  const company = seedCompany();
  await stubAppBridge(page, { PushNotifications: PUSH });
  await logIn(page, company);

  await page.getByRole("link", { name: "Dzwonek, nieprzeczytane: 1" }).click();
  const settings = page.getByRole("region", { name: "Powiadomienia na telefonie" });
  await expect(settings.getByRole("button", { name: "Włącz powiadomienia" })).toBeVisible();
  expect(await methods(page)).not.toContain("requestPermissions");

  await settings.getByRole("button", { name: "Włącz powiadomienia" }).click();
  await expect.poll(() => methods(page)).toEqual(expect.arrayContaining(["requestPermissions", "register"]));
  await emitPluginEvent(page, "PushNotifications", "registration", { value: TOKEN });

  await expect(settings).toContainText("Powiadomienia na tym telefonie są włączone.");
  expect(subscriptionsOf(company.email)).toEqual([{ kind: "aplikacja", token: TOKEN, endpoint: null }]);

  await settings.getByRole("button", { name: "Wyłącz powiadomienia" }).click();
  await expect(settings.getByRole("button", { name: "Włącz powiadomienia" })).toBeVisible();
  expect(await methods(page)).toContain("unregister");
  expect(subscriptionsOf(company.email)).toEqual([]);
});

test("dotknięcie powiadomienia w aplikacji otwiera adres z powiadomienia, a obcy adres prowadzi do dzwonka", async ({ page }) => {
  const company = seedCompany();
  await stubAppBridge(page, { PushNotifications: PUSH });
  await logIn(page, company);
  await expect.poll(() => listensTo(page, "PushNotifications", "pushNotificationActionPerformed")).toBe(true);

  await emitPluginEvent(page, "PushNotifications", "pushNotificationActionPerformed", {
    actionId: "tap",
    notification: { id: "0:1", data: { url: `/narzedzia/${company.toolId}`, tag: "dzwonek:1" } },
  });
  await expect(page).toHaveURL(new RegExp(`/narzedzia/${company.toolId}$`));

  await expect.poll(() => listensTo(page, "PushNotifications", "pushNotificationActionPerformed")).toBe(true);
  await emitPluginEvent(page, "PushNotifications", "pushNotificationActionPerformed", {
    actionId: "tap",
    notification: { id: "0:2", data: { url: "https://zly.example/narzedzia" } },
  });
  await expect(page).toHaveURL(/\/dzwonek$/);
});
