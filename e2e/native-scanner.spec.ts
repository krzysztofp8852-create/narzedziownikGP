import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { emitPluginEvent, pluginCalls, stubAppBridge } from "./support/app-bridge";

function seed<T>(script: string): T {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as T;
}

type ChecklistCompany = { companyName: string; email: string; password: string; toolIds: Record<string, string> };
type PunchCompany = {
  companyName: string;
  posterCode: string;
  site: { lat: number; lng: number };
  worker: { login: string; password: string };
};

/** Wtyczka skanera ML Kit w aplikacji: zgoda na aparat jest, a latarkę telefon ma. */
const SCANNER = {
  checkPermissions: { camera: "granted" },
  requestPermissions: { camera: "granted" },
  startScan: null,
  stopScan: null,
  isTorchAvailable: { available: true },
  enableTorch: null,
  disableTorch: null,
  openSettings: null,
};

/** Natywny skaner odczytał kod QR z tą treścią, tak jak ML Kit przez mostek. */
const scan = (page: Page, rawValue: string) =>
  emitPluginEvent(page, "BarcodeScanner", "barcodesScanned", { barcodes: [{ rawValue, format: "QR_CODE" }] });
const methods = async (page: Page) => (await pluginCalls(page, "BarcodeScanner")).map((call) => call.method);

async function logIn(page: Page, login: string, password: string, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

test("w aplikacji „Skanuj QR” otwiera natywny skaner z latarką, a zeskanowane naklejki dają ruch z podpowiedzią wydania", async ({ page }) => {
  const company = seed<ChecklistCompany>("e2e/support/seed-checklist.mts");
  await stubAppBridge(page, { BarcodeScanner: SCANNER });
  await logIn(page, company.email, company.password, company.companyName);

  await page.getByRole("button", { name: "Skanuj QR" }).click();
  const scanner = page.getByRole("dialog", { name: "Skaner QR" });
  await expect(scanner).toContainText("Nakieruj aparat na naklejkę.");
  await expect
    .poll(() => pluginCalls(page, "BarcodeScanner"))
    .toContainEqual({ plugin: "BarcodeScanner", method: "startScan", options: { formats: ["QR_CODE"] } });
  // Obraz z aparatu jest pod stroną, więc strona znika na czas skanu, a zostaje tylko nakładka skanera.
  await expect(page.getByRole("button", { name: "Skanuj QR" })).toBeHidden();

  await scan(page, `https://narzedziownikgp.pl/narzedzia/${company.toolIds["S-01"]}`);
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("Dodano S-01.");
  // Naklejka trzymana w kadrze daje kolejne odczyty, ale liczy się raz.
  await scan(page, `https://narzedziownikgp.pl/narzedzia/${company.toolIds["S-01"]}`);
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("Dodano S-01.");
  await scan(page, "https://example.com/menu");
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("To nie jest naklejka narzędzia.");
  await scan(page, `https://narzedziownikgp.pl/narzedzia/${company.toolIds["S-02"]}`);
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("Dodano S-02.");

  const torch = scanner.getByRole("button", { name: "Latarka" });
  await torch.click();
  await expect(torch).toHaveAttribute("aria-pressed", "true");
  await torch.click();
  await expect(torch).toHaveAttribute("aria-pressed", "false");
  expect((await methods(page)).filter((method) => method.endsWith("Torch"))).toEqual(["enableTorch", "disableTorch"]);

  await scanner.getByRole("button", { name: "Zamknij skaner" }).click();
  await expect(scanner).toBeHidden();
  await expect.poll(() => methods(page)).toContain("stopScan");
  const fromBase = page.getByRole("form", { name: "Ruch z: Magazyn" });
  await expect(fromBase.getByTestId("scan-summary")).toHaveText("Wydanie: S-01, S-02 → Rataje");
  await fromBase.getByRole("button", { name: "Zatwierdź ✓" }).click();
  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01, S-02 → Rataje");
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Adam Nowak · skaner QR");

  // Aparat włączony ponownie: ten sam skaner natywny, a naklejka z budowy kierownika daje podpowiedź zwrotu.
  await page.getByRole("button", { name: "Włącz aparat" }).click();
  await scan(page, `https://narzedziownikgp.pl/narzedzia/${company.toolIds["S-01"]}`);
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("Dodano S-01.");
  await scanner.getByRole("button", { name: "Zamknij skaner" }).click();
  await expect(page.getByRole("form", { name: "Ruch z: Rataje" }).getByTestId("scan-summary")).toHaveText("Zwrot: S-01 → Magazyn");
});

test.describe("odbicie", () => {
  test.use({ permissions: ["geolocation"] });

  test("w aplikacji „Odbij się” skanuje plakat budowy natywnym skanerem i zapisuje wejście ze sprawdzonym położeniem", async ({ page, context }) => {
    const company = seed<PunchCompany>("e2e/support/seed-punch.mts");
    await context.setGeolocation({ latitude: company.site.lat + 80 / 111_195, longitude: company.site.lng, accuracy: 15 });
    await stubAppBridge(page, { BarcodeScanner: SCANNER });
    await logIn(page, company.worker.login, company.worker.password, company.companyName);

    await page.getByRole("button", { name: "Odbij się" }).click();
    const scanner = page.getByRole("dialog", { name: "Skaner QR" });
    await expect(scanner).toContainText("Nakieruj aparat na kod QR plakatu budowy.");
    await expect.poll(() => methods(page)).toContain("startScan");

    await scan(page, "https://example.com/menu");
    await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("To nie jest kod plakatu budowy.");
    await scan(page, `https://narzedziownikgp.pl/odbicie/${company.posterCode}`);

    await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
    await expect(page.getByTestId("punch-check")).toHaveText("na budowie, 80 m");
    // Po przejściu na stronę odbicia skaner gaśnie, a strona jest znowu widoczna.
    await expect(scanner).toBeHidden();
    await expect.poll(() => methods(page)).toContain("stopScan");
  });

  test("bez zasięgu plakat zeskanowany natywnym skanerem trafia do kolejki offline jak dziś", async ({ page, context }) => {
    const company = seed<PunchCompany>("e2e/support/seed-punch.mts");
    await context.setGeolocation({ latitude: company.site.lat, longitude: company.site.lng, accuracy: 15 });
    await stubAppBridge(page, { BarcodeScanner: SCANNER });
    await logIn(page, company.worker.login, company.worker.password, company.companyName);

    await context.setOffline(true);
    await page.getByRole("button", { name: "Odbij się" }).click();
    await expect.poll(() => methods(page)).toContain("startScan");
    await scan(page, `https://narzedziownikgp.pl/odbicie/${company.posterCode}`);

    await expect(page.getByTestId("punch-queued")).toContainText("Brak zasięgu. Wejście zapisane w telefonie: kod");
    await expect(page.getByRole("dialog", { name: "Skaner QR" })).toBeHidden();
    await expect.poll(() => methods(page)).toContain("stopScan");
    await context.setOffline(false);
  });
});

test("bez zgody na aparat aplikacja mówi, jak ją włączyć, a kod ze zniszczonej naklejki da się wpisać ręcznie", async ({ page }) => {
  const company = seed<ChecklistCompany>("e2e/support/seed-checklist.mts");
  await stubAppBridge(page, { BarcodeScanner: { ...SCANNER, checkPermissions: { camera: "prompt" }, requestPermissions: { camera: "denied" } } });
  await logIn(page, company.email, company.password, company.companyName);

  await page.getByRole("button", { name: "Skanuj QR" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "aparatu" })).toHaveText(
    "Brak zgody na użycie aparatu. Włącz ją w ustawieniach telefonu: Aplikacje → NarzędziownikGP → Uprawnienia → Aparat. Możesz też wpisać kod ręcznie.",
  );
  await expect(page.getByRole("dialog", { name: "Skaner QR" })).toHaveCount(0);
  await page.getByRole("button", { name: "Otwórz ustawienia" }).click();
  await expect.poll(() => methods(page)).toContain("openSettings");
  expect(await methods(page)).not.toContain("startScan");

  // Wraca z ustawień telefonu bez zgody: dalej komunikat.
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(page.getByRole("button", { name: "Otwórz ustawienia" })).toBeVisible();
  expect(await methods(page)).not.toContain("startScan");

  await page.getByLabel("Kod z naklejki").fill("s-01");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByRole("form", { name: "Ruch z: Magazyn" }).getByTestId("scan-summary")).toHaveText("Wydanie: S-01 → Rataje");
});

test("po zgodzie na aparat włączonej w ustawieniach telefonu skaner natywny rusza sam po powrocie do aplikacji", async ({ page }) => {
  const company = seed<ChecklistCompany>("e2e/support/seed-checklist.mts");
  await stubAppBridge(page, { BarcodeScanner: { ...SCANNER, checkPermissions: { camera: "denied" }, requestPermissions: { camera: "denied" } } });
  await logIn(page, company.email, company.password, company.companyName);

  await page.getByRole("button", { name: "Skanuj QR" }).click();
  await page.getByRole("button", { name: "Otwórz ustawienia" }).click();
  // W ustawieniach telefonu użytkownik włącza aparat, a skorupa po powrocie wysyła `resume`.
  await page.evaluate(() => {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, Record<string, unknown>> } }).Capacitor.Plugins;
    plugins.BarcodeScanner.checkPermissions = async () => ({ camera: "granted" });
    document.dispatchEvent(new Event("resume"));
  });

  const scanner = page.getByRole("dialog", { name: "Skaner QR" });
  await expect(scanner).toContainText("Nakieruj aparat na naklejkę.");
  await scan(page, `https://narzedziownikgp.pl/narzedzia/${company.toolIds["S-03"]}`);
  await expect(scanner.getByTestId("native-scanner-feedback")).toHaveText("Dodano S-03.");
});

test("aplikacja bez wtyczki skanera używa skanera webowego", async ({ page }) => {
  const company = seed<ChecklistCompany>("e2e/support/seed-checklist.mts");
  await stubAppBridge(page);
  await logIn(page, company.email, company.password, company.companyName);

  await page.getByRole("button", { name: "Skanuj QR" }).click();
  const webScanner = page
    .getByLabel("Podgląd aparatu")
    .or(page.getByText("Brak zgody na użycie aparatu. Zezwól na nie w ustawieniach przeglądarki"));
  await expect(webScanner).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Skaner QR" })).toHaveCount(0);
});
