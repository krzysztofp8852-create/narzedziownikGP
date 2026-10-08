import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { pluginCalls, stubAppBridge } from "./support/app-bridge";

function seed<T>(script: string): T {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as T;
}

type IssuesCompany = { companyName: string; worker: { login: string; password: string }; toolId: string };
type DeadlinesCompany = { companyName: string; owner: { email: string; password: string }; hammerId: string };

async function logIn(page: Page, login: string, password: string, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

/** Najmniejszy poprawny PNG (1×1 px). */
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/**
 * Wtyczka aparatu w aplikacji: zdjęcie z aparatu i z galerii to pliki na telefonie, które skorupa podaje stronie pod
 * jej własnym adresem (`/_capacitor_file_/…`). Tu ten adres oddaje PNG.
 */
async function stubCamera(page: Page, baseURL: string) {
  const file = (name: string) => `${baseURL}/_capacitor_file_/data/user/0/pl.narzedziownikgp.app/cache/${name}`;
  await page.route("**/_capacitor_file_/**", (route) => route.fulfill({ contentType: "image/png", body: PHOTO }));
  await stubAppBridge(page, {
    Camera: {
      takePhoto: { type: 0, webPath: file("aparat.png"), saved: false },
      chooseFromGallery: { results: [{ type: 0, webPath: file("galeria.png"), saved: false }] },
    },
  });
}

/** Aparat odmówiony: wtyczka odrzuca zdjęcie z aparatu tak, jak Android po odmowie zgody. */
async function denyCamera(page: Page) {
  await page.evaluate(() => {
    const camera = (window as unknown as { Capacitor: { Plugins: { Camera: Record<string, unknown> } } }).Capacitor.Plugins.Camera;
    camera.takePhoto = () => Promise.reject({ message: "Couldn't access camera.", code: "OS-PLUG-CAMR-0003" });
  });
}

const cameraMethods = async (page: Page) => (await pluginCalls(page, "Camera")).map((call) => call.method);

/** Rozwijany panel na karcie narzędzia po tytule, w `scope` (np. jednym terminie). */
function panel(page: Page, scope: Locator, title: string) {
  return scope.locator("details").filter({ has: page.locator("summary", { hasText: title }) });
}

test("w aplikacji zdjęcie uszkodzenia przychodzi z aparatu, zmniejsza się do JPG i zapisuje w zgłoszeniu", async ({ page, baseURL }) => {
  const company = seed<IssuesCompany>("e2e/support/seed-issues.mts");
  await stubCamera(page, baseURL!);
  await logIn(page, company.worker.login, company.worker.password, company.companyName);

  await page.goto(`/zgloszenia/nowe?narzedzie=${company.toolId}&rodzaj=uszkodzenie`);
  await page.getByLabel("Opis").fill("Pęknięta obudowa");
  // W aplikacji nad wyborem pliku są dwa przyciski aparatu; wybór pliku zostaje.
  await expect(page.getByLabel("Zdjęcie (opcjonalnie)")).toBeVisible();
  await page.getByRole("button", { name: "Zrób zdjęcie" }).click();
  await expect(page.getByTestId("photo-preview").getByRole("img")).toBeVisible();
  expect(await cameraMethods(page)).toEqual(["takePhoto"]);
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

  await expect(page.getByRole("heading", { name: "Uszkodzenie W-02 Wiertarka Makita" })).toBeVisible();
  const photo = page.getByRole("img", { name: "Zdjęcie do zgłoszenia" });
  await expect(photo).toBeVisible();
  const stored = await page.request.get((await photo.getAttribute("src"))!);
  expect(stored.headers()["content-type"]).toBe("image/jpeg");
});

test("w aplikacji dokument terminu przychodzi z aparatu i zapisuje się, a PDF dalej da się wybrać z pliku", async ({ page, baseURL }) => {
  const company = seed<DeadlinesCompany>("e2e/support/seed-deadlines.mts");
  await stubCamera(page, baseURL!);
  await logIn(page, company.owner.email, company.owner.password, company.companyName);

  await page.goto(`/narzedzia/${company.hammerId}`);
  const inspection = page.getByTestId("deadline-przeglad");
  const attach = panel(page, inspection, "Dołącz dokument");
  await attach.locator("summary").click();
  await expect(attach.getByLabel("Plik (PDF albo zdjęcie)")).toBeVisible();
  await expect(attach.getByLabel("Plik (PDF albo zdjęcie)")).toHaveAttribute("accept", /application\/pdf/);
  await attach.getByRole("button", { name: "Zrób zdjęcie" }).click();
  await expect.poll(() => cameraMethods(page)).toEqual(["takePhoto"]);
  await attach.getByRole("button", { name: "Dołącz", exact: true }).click();

  const document = inspection.getByRole("link", { name: "Protokół: dokument.jpg" });
  await expect(document).toBeVisible();
  const download = await page.request.get((await document.getAttribute("href"))!);
  expect(download.headers()["content-type"]).toBe("image/jpeg");
});

test("w aplikacji bez zgody na aparat program mówi, jak ją włączyć, a zdjęcie z galerii dalej przechodzi", async ({ page, baseURL }) => {
  const company = seed<IssuesCompany>("e2e/support/seed-issues.mts");
  await stubCamera(page, baseURL!);
  await logIn(page, company.worker.login, company.worker.password, company.companyName);

  await page.goto(`/zgloszenia/nowe?narzedzie=${company.toolId}&rodzaj=uszkodzenie`);
  await page.getByLabel("Opis").fill("Brak tarczy");
  await denyCamera(page);
  await page.getByRole("button", { name: "Zrób zdjęcie" }).click();
  // Next ma własny pusty `alert` do ogłaszania przejść, więc szukamy po treści.
  const denied = page.getByRole("alert").filter({ hasText: "Brak zgody na użycie aparatu" });
  await expect(denied).toHaveText(
    "Brak zgody na użycie aparatu. Włącz ją w ustawieniach telefonu: Aplikacje → NarzędziownikGP → Uprawnienia → Aparat. Możesz też wybrać zdjęcie z galerii.",
  );
  await expect(page.getByTestId("photo-preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Z galerii" }).click();
  await expect(page.getByTestId("photo-preview").getByRole("img")).toBeVisible();
  await expect(denied).toHaveCount(0);
  expect(await cameraMethods(page)).toEqual(["chooseFromGallery"]);
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(page.getByRole("img", { name: "Zdjęcie do zgłoszenia" })).toBeVisible();
});

test("aplikacja bez wtyczki aparatu pokazuje zwykłe pole pliku", async ({ page }) => {
  const company = seed<IssuesCompany>("e2e/support/seed-issues.mts");
  await stubAppBridge(page);
  await logIn(page, company.worker.login, company.worker.password, company.companyName);

  await page.goto(`/zgloszenia/nowe?narzedzie=${company.toolId}&rodzaj=uszkodzenie`);
  await expect(page.getByLabel("Zdjęcie (opcjonalnie)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zrób zdjęcie" })).toHaveCount(0);
  await page.getByLabel("Zdjęcie (opcjonalnie)").setInputFiles({ name: "zdjecie.png", mimeType: "image/png", buffer: PHOTO });
  await expect(page.getByTestId("photo-preview").getByRole("img")).toBeVisible();
});
