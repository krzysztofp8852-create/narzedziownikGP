import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  login: string;
  password: string;
}

interface SeededCompany {
  companyName: string;
  siteId: string;
  posterCode: string;
  site: { lat: number; lng: number };
  manager: Credentials;
  worker: Credentials;
  /** Z `forgottenExit`: godzina wyjścia do uzupełnienia przy wczorajszym odbiciu „bez wyjścia”. */
  forgottenExitAt: string | null;
}

function seedCompany({ forgottenExit = false } = {}): SeededCompany {
  const args = ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-punch.mts", ...(forgottenExit ? ["--zapomniane-wyjscie"] : [])];
  const output = execFileSync("npx", args, { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as SeededCompany;
}

/** Tyle stopni szerokości geograficznej to `meters` metrów na północ. */
const north = (meters: number) => meters / 111_195;

async function fillLogin(page: Page, { login, password }: Credentials) {
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test.use({ permissions: ["geolocation"] });

test("pracownik skanuje plakat aparatem 100 m od budowy: po logowaniu wejście zapisuje się od razu, a drugi skan pyta „Kończysz?” i zapisuje wyjście", async ({
  page,
  context,
}) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(100), longitude: company.site.lng, accuracy: 15 });

  // Adres z kodu QR plakatu otwarty bez logowania: po zalogowaniu wracamy na stronę odbicia.
  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page).toHaveURL(/\/logowanie\?next=/);
  await fillLogin(page, company.worker);

  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
  await expect(page.getByTestId("punch-check")).toHaveText("na budowie, 100 m");

  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
});

test("kierownik po skanie plakatu odbija z listy „Odbij też…” osobę bez telefonu, a potem tak samo jej wyjście", async ({ page, context }) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(60), longitude: company.site.lng, accuracy: 15 });
  await page.goto("/logowanie");
  await fillLogin(page, company.manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  const list = page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wejście, \d{1,2}:\d{2}$/);

  await page.goto(`/budowy/${company.siteId}/ludzie`);
  const present = page.getByRole("list", { name: "Teraz na budowie" });
  await expect(present.getByTestId("punch").filter({ hasText: "Wojciech Lis" }).getByTestId("punch-punched-by")).toHaveText("odbił: Adam Nowak");

  // Drugi skan: kierownik zostaje na budowie, a brygadzista kończy.
  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await list.getByRole("checkbox", { name: "Wojciech Lis · wyjście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wyjście, \d{1,2}:\d{2}$/);
  await page.goto(`/budowy/${company.siteId}/ludzie`);
  await expect(page.getByRole("main").getByText("Teraz na budowie (1)")).toBeVisible();
  await expect(present.getByText("Wojciech Lis")).toHaveCount(0);
});

test("odbicie 5 km od budowy przyciskiem „Odbij się” zapisuje się z oznaczeniem, a kierownik je wyjaśnia", async ({ page, context }) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(5_000), longitude: company.site.lng, accuracy: 30 });

  await page.goto("/logowanie");
  await fillLogin(page, company.worker);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.getByRole("button", { name: "Odbij się" }).click();
  await page.getByRole("button", { name: "Wyłącz aparat" }).click();
  // Kod spod kodu QR plakatu, przepisany tak, jak go widać na plakacie.
  await page.getByLabel("Kod z plakatu").fill(`${company.posterCode.slice(0, 5)}-${company.posterCode.slice(5)}`);
  await page.getByRole("button", { name: "Dalej" }).click();

  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(page.getByTestId("punch-check")).toHaveText("Do wyjaśnienia przez kierownika: poza budową, 5,0 km.");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await fillLogin(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.goto(`/budowy/${company.siteId}/ludzie`);
  const present = page.getByRole("list", { name: "Teraz na budowie" });
  await expect(present).toContainText("Piotr Kowalczyk");
  await expect(present).toContainText("poza budową, 5,0 km");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Odbicia do wyjaśnienia" }).click();
  const toClarify = page.getByRole("list", { name: "Odbicia do wyjaśnienia" });
  await expect(toClarify.getByTestId("punch")).toHaveCount(1);
  await toClarify.getByLabel("Notatka (opcjonalnie)").fill("Był na budowie, zły GPS");
  await toClarify.getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();
});

test("kierownik uzupełnia z powodem wyjście odbicia zamkniętego o północy „bez wyjścia”: odbicie znika z wyjaśnienia, a poprawka zostaje w historii", async ({
  page,
}) => {
  const company = seedCompany({ forgottenExit: true });
  await page.goto("/logowanie");
  await fillLogin(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Odbicia do wyjaśnienia" }).click();
  const toClarify = page.getByRole("list", { name: "Odbicia do wyjaśnienia" });
  await expect(toClarify.getByTestId("punch")).toHaveCount(1);
  await expect(toClarify).toContainText("Wyjście: bez wyjścia, zamknięte o północy");
  await expect(toClarify.getByTestId("punch-time-on-site")).toHaveText("Nie liczy się do czasu na budowie, dopóki ktoś nie uzupełni wyjścia.");

  await toClarify.getByText("Popraw godziny").click();
  await toClarify.getByLabel("Wyjście", { exact: true }).fill(company.forgottenExitAt!);
  await toClarify.getByLabel("Powód").fill("Zapomniał odbić, potwierdził brygadzista");
  await toClarify.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();

  await page.goto(`/budowy/${company.siteId}/ludzie`);
  const history = page.getByRole("list", { name: "Historia odbić" });
  await expect(history.getByTestId("punch-correction")).toContainText("Uzupełnione wyjście");
  await expect(history.getByTestId("punch-correction")).toContainText("Zapomniał odbić, potwierdził brygadzista (Adam Nowak");
  await expect(history.getByTestId("punch-time-on-site")).toHaveText("Czas na budowie: 8 godz. 0 min");
});

test("pracownik bez zasięgu odbija wejście i wyjście skanerem programu: telefon pyta „Kończysz?”, a po powrocie sieci odbicie ma oznaczenie „zapisane offline”", async ({
  page,
  context,
}) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(50), longitude: company.site.lng, accuracy: 15 });
  const typedCode = `${company.posterCode.slice(0, 5)}-${company.posterCode.slice(5)}`;

  await page.goto("/logowanie");
  await fillLogin(page, company.worker);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await context.setOffline(true);
  for (const step of ["wejście", "wyjście"]) {
    await page.getByRole("button", { name: "Odbij się" }).click();
    // Wyłączony aparat zostaje wyłączony przy następnym otwarciu skanera.
    if (step === "wejście") await page.getByRole("button", { name: "Wyłącz aparat" }).click();
    await page.getByLabel("Kod z plakatu").fill(typedCode);
    await page.getByRole("button", { name: "Dalej" }).click();
    if (step === "wyjście") {
      // Telefon pamięta wejście z kolejki, więc bez sieci pyta jak serwer.
      await expect(page.getByText("Kończysz na tej budowie?")).toBeVisible();
      await page.getByRole("button", { name: "Tak, kończę" }).click();
    }
    await expect(page.getByTestId("punch-queued")).toContainText(
      `Brak zasięgu. ${step === "wejście" ? "Wejście" : "Wyjście"} zapisane w telefonie: kod ${typedCode}`,
    );
    await page.getByRole("button", { name: "Na tablicę" }).click();
  }
  await expect(page.getByTestId("pending-count")).toHaveText("⏳ Oczekuje: 2");
  await page.getByTestId("pending-count").click();
  const pending = page.getByRole("list", { name: "Czekające na sieć" });
  await expect(pending.getByRole("listitem")).toHaveText([/Odbicie, wejście: kod/, /Odbicie, wyjście: kod/]);

  await context.setOffline(false);
  await expect(page.getByTestId("pending-count")).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await fillLogin(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto(`/budowy/${company.siteId}/ludzie`);
  const history = page.getByRole("list", { name: "Historia odbić" });
  await expect(history.getByTestId("punch")).toHaveCount(1);
  await expect(history.getByTestId("punch")).toContainText("Piotr Kowalczyk");
  await expect(history.getByTestId("punch")).toContainText("Wejście: na budowie, 50 m (zapisane offline) · Wyjście: na budowie, 50 m (zapisane offline)");
});
