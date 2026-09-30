import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

/** Konto super-admina tym samym skryptem, którego używa GP Engineering. */
function createSuperAdmin() {
  const email = `smoke-super-${randomUUID().slice(0, 8)}@narzedziownik.test`;
  const output = execFileSync(
    "npx",
    ["tsx", "--env-file-if-exists=.env.local", "scripts/create-super-admin.mts", "--email", email, "--json"],
    { encoding: "utf8" },
  );
  const { password } = JSON.parse(output.trim().split("\n").at(-1)!) as { password: string };
  return { email, password };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

// Lokalny test dymny pisze do wspólnej bazy z produkcją (ADR 0002), a konta super-admina nie da się
// potem usunąć z aplikacji. Dlatego ten test działa tylko w CI, na jednorazowym Supabase.
test.skip(!process.env.CI, "tylko w CI: zakłada konto super-admina");

test("super-admin zakłada firmę z właścicielem, zmienia próg, wpisuje „opłacone do” i włącza tryb tylko do odczytu, a właściciel widzi baner i nie zapisze zmian", async ({ page }) => {
  const admin = createSuperAdmin();
  const suffix = randomUUID().slice(0, 8);
  const companyName = `Test dymny panelu ${suffix}`;
  const ownerEmail = `smoke-owner-${suffix}@narzedziownik.test`;

  await signIn(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/super-admin$/);
  await expect(page.getByRole("navigation", { name: "Panel super-admina" })).toContainText("Czat z supportem");

  await page.getByRole("link", { name: "Nowa firma" }).click();
  await page.getByLabel("Nazwa firmy w aplikacji").fill(companyName);
  await page.getByLabel("Nabywca").fill(`${companyName} sp. z o.o.`);
  await page.getByLabel("NIP").fill("778-123-45-64");
  await page.getByLabel("Adres").fill("ul. Polna 3\n60-001 Poznań");
  await page.getByLabel("Próg abonamentu").selectOption("sredni");
  await page.getByLabel("Imię i nazwisko").fill("Jan Testowy");
  await page.getByLabel("E-mail").fill(ownerEmail);
  await page.getByRole("button", { name: "Załóż firmę" }).click();
  await expect(page.getByText("Sprawdź wpisane dane.")).toBeVisible();

  // Poprawiony NIP; pozostałe pola zostały w formularzu.
  await page.getByLabel("NIP").fill("778-123-45-63");
  await page.getByRole("button", { name: "Załóż firmę" }).click();
  const temporaryPassword = await page.getByTestId("temporary-password").innerText();
  expect(temporaryPassword).toBeTruthy();

  await page.getByRole("link", { name: "Wszystkie firmy" }).click();
  const row = page.getByTestId("company-row").filter({ hasText: companyName });
  await expect(row).toContainText("Średni");
  await expect(row).toContainText("0 / 300");
  await expect(row).toContainText("brak wpłaty");
  await expect(row).toContainText("Czeka na wpłatę");

  await row.getByRole("link", { name: companyName }).click();
  await page.getByLabel("Próg abonamentu").selectOption("duzy");
  await page.getByRole("button", { name: "Zmień próg" }).click();
  await expect(page.getByText("Próg zapisany.")).toBeVisible();

  await page.getByLabel("Opłacone do").fill("2099-12-31");
  await page.getByRole("button", { name: "Zapisz datę" }).click();
  await expect(page.getByText("Data „opłacone do” zapisana.")).toBeVisible();
  await expect(page.getByTestId("subscription-status")).toHaveText("Aktywna");

  await page.getByRole("button", { name: "Włącz tryb tylko do odczytu" }).click();
  await expect(page.getByTestId("subscription-status")).toHaveText("Tylko do odczytu (ręcznie)");
  await page.getByRole("button", { name: "Wyłącz tryb tylko do odczytu" }).click();
  await expect(page.getByTestId("subscription-status")).toHaveText("Aktywna");
  await page.getByRole("button", { name: "Włącz tryb tylko do odczytu" }).click();
  await expect(page.getByTestId("subscription-status")).toHaveText("Tylko do odczytu (ręcznie)");

  await page.getByRole("link", { name: "Wszystkie firmy" }).click();
  await expect(row).toContainText("Duży");
  await expect(row).toContainText("31.12.2099");

  // Właściciel nowej firmy loguje się hasłem tymczasowym z panelu, a panel nie jest dla niego.
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, ownerEmail, temporaryPassword!);
  await expect(page).toHaveURL(/\/zmien-haslo$/);
  await page.goto("/super-admin");
  await expect(page).toHaveURL(/\/zmien-haslo$/);

  // Hasło zmieni także w trybie tylko do odczytu, a potem widzi dane, baner i abonament, ale nic nie zapisze.
  const ownerPassword = `Nowe-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(ownerPassword);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Gdzie jest co" })).toBeVisible();
  await expect(page.getByTestId("read-only-banner")).toContainText("Firma jest w trybie tylko do odczytu.");

  await page.goto("/ustawienia");
  await expect(page.getByTestId("read-only-banner")).toBeVisible();
  await expect(page.getByTestId("subscription")).toContainText("Duży");
  await expect(page.getByTestId("subscription-tools")).toHaveText("0 z 1000");
  await page.getByLabel("Po ilu dniach").fill("21");
  await page.getByRole("region", { name: "Alarm na budowie" }).getByRole("button", { name: "Zapisz", exact: true }).click();
  // Next.js ma też własny, pusty `role="alert"` (ogłaszanie zmiany strony), więc szukamy komunikatu po treści.
  await expect(
    page.getByRole("alert").filter({ hasText: "Firma jest w trybie tylko do odczytu, więc tej zmiany nie zapiszemy." }),
  ).toBeVisible();
});

test("super-admin usuwa firmę dopiero w trybie tylko do odczytu i po wpisaniu jej nazwy, a właściciel traci dostęp", async ({ page }) => {
  const admin = createSuperAdmin();
  const suffix = randomUUID().slice(0, 8);
  const companyName = `Test usuwania ${suffix}`;
  const ownerEmail = `smoke-deleted-${suffix}@narzedziownik.test`;

  await signIn(page, admin.email, admin.password);
  await page.getByRole("link", { name: "Nowa firma" }).click();
  await page.getByLabel("Nazwa firmy w aplikacji").fill(companyName);
  await page.getByLabel("Nabywca").fill(`${companyName} sp. z o.o.`);
  await page.getByLabel("NIP").fill("778-123-45-63");
  await page.getByLabel("Adres").fill("ul. Polna 3\n60-001 Poznań");
  await page.getByLabel("Imię i nazwisko").fill("Jan Usuwany");
  await page.getByLabel("E-mail").fill(ownerEmail);
  await page.getByRole("button", { name: "Załóż firmę" }).click();
  const temporaryPassword = await page.getByTestId("temporary-password").innerText();
  await page.getByRole("link", { name: "Przejdź do firmy" }).click();

  // Poza trybem tylko do odczytu nie ma czego potwierdzać.
  const deletion = page.getByRole("region", { name: "Usunięcie firmy" });
  await expect(deletion).toContainText("Najpierw włącz tryb tylko do odczytu.");
  await expect(deletion.getByRole("button", { name: "Usuń firmę na zawsze" })).toHaveCount(0);

  await page.getByRole("button", { name: "Włącz tryb tylko do odczytu" }).click();
  await expect(page.getByTestId("subscription-status")).toHaveText("Tylko do odczytu (ręcznie)");
  const confirmation = deletion.getByLabel("Wpisz nazwę firmy, żeby potwierdzić");
  const submit = deletion.getByRole("button", { name: "Usuń firmę na zawsze" });
  await confirmation.fill(companyName.toLowerCase());
  await expect(submit).toBeDisabled();
  await confirmation.fill(companyName);
  await submit.click();

  await expect(page).toHaveURL(/\/super-admin\?usunieta=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Firma usunięta razem z danymi" })).toBeVisible();
  await expect(page.getByTestId("company-row").filter({ hasText: companyName })).toHaveCount(0);

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await signIn(page, ownerEmail, temporaryPassword);
  await expect(page.getByText("Nieprawidłowy login lub hasło.")).toBeVisible();
});
