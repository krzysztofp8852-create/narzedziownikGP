import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { openFromNav, openMyAccount, typeScanCode } from "./support/navigation";
import { north } from "./support/punch-crew";

interface Credentials {
  email: string;
  password: string;
}

interface WorkerBoardCompany {
  companyName: string;
  posterCode: string;
  site: { lat: number; lng: number };
  worker: { login: string; password: string };
}

function seedWorkerBoard(): WorkerBoardCompany {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-worker-board.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as WorkerBoardCompany;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials };
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("właściciel dopisuje osobę bez konta, zakłada jej konto pracownika, a ten loguje się nazwą użytkownika i widzi tablicę bez złotówek i ruchów", async ({
  page,
}) => {
  // Cztery logowania, zmiana hasła i dwa hasła tymczasowe.
  test.setTimeout(90_000);
  const company = seedCompany();

  await signIn(page, company.owner.email, company.owner.password);
  // Przejście dalej dopiero po zalogowaniu; inaczej /ludzie odeśle z powrotem do logowania.
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await openFromNav(page, "Ludzie");
  await expect(page).toHaveURL(/\/ludzie$/);
  const people = page.locator("#ludzie");
  await people.locator("summary", { hasText: "Dopisz osobę bez konta" }).click();
  await people.getByLabel("Imię i nazwisko").first().fill("Jan Kowalski");
  await people.getByLabel("Notatka (opcjonalnie)").first().fill("Brygada Rataje");
  await people.locator("form").first().getByRole("button", { name: "Dopisz osobę", exact: true }).click();
  const person = people.locator("li", { hasText: "Jan Kowalski" });
  await expect(person).toContainText("Bez konta");
  await expect(person).toContainText("Brygada Rataje");

  // Konto dla osoby z kartoteki: ten sam wpis, bez drugiej osoby.
  await person.getByRole("link", { name: "Załóż konto tej osobie" }).click();
  const account = page.locator("#konto");
  await expect(account.getByLabel("Dla kogo")).toHaveValue(/.+/);
  await expect(account.getByLabel("Imię")).toHaveCount(0);
  await account.getByLabel("Rola").selectOption({ label: "Pracownik" });
  await account.getByLabel("Nazwa użytkownika").fill("jan.kowalski");
  await account.locator("form").getByRole("button", { name: "Załóż konto" }).click();
  await expect(account.getByText("Nazwa użytkownika do logowania: jan.kowalski")).toBeVisible();
  const temporaryPassword = await account.getByTestId("temporary-password").innerText();
  await expect(people.locator("li", { hasText: "Jan Kowalski" })).toHaveCount(1);
  await expect(person).toContainText("Konto: Pracownik");
  await expect(person.getByText("Login: jan.kowalski")).toBeVisible();

  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, "jan.kowalski", "zle-haslo-123");
  await expect(page.getByText("Nieprawidłowy login lub hasło.")).toBeVisible();
  await signIn(page, "Jan.Kowalski", temporaryPassword);
  await expect(page).toHaveURL(/\/zmien-haslo$/);

  const newPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(newPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(newPassword);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect(page.getByTestId("punch-status")).toHaveText("Nie jesteś odbity");
  await expect(page.getByRole("region", { name: "Sprzęt na Twojej budowie" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("zł");
  await expect(page.getByRole("heading", { name: "Operacje" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wydaj z bazy" })).toHaveCount(0);

  // Pracownik zapomniał hasła: właściciel nadaje nowe tymczasowe, a pracownik loguje się nim, odczytanym z ekranu.
  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.owner.email, company.owner.password);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/ludzie");
  const member = people.locator("li", { hasText: "Jan Kowalski" });
  await member.locator("summary", { hasText: "Konto: hasło, dezaktywacja" }).click();
  await member.getByRole("button", { name: "Nowe hasło tymczasowe" }).click();
  const resetPassword = await member.getByTestId("temporary-password").innerText();
  expect(resetPassword).not.toBe(temporaryPassword);

  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, "jan.kowalski", resetPassword);
  await expect(page).toHaveURL(/\/zmien-haslo$/);
});

test.describe("tablica pracownika", () => {
  test.use({ permissions: ["geolocation"] });

  test("nieodbity widzi swoje sprawy i podpowiedź zamiast sprzętu, a po odbiciu plakatem sprzęt swojej budowy, tylko do podglądu", async ({
    page,
    context,
  }) => {
    const company = seedWorkerBoard();
    // Telefon stoi przy budowie Rataje z seeda.
    await context.setGeolocation({ latitude: company.site.lat + north(50), longitude: company.site.lng, accuracy: 15 });
    await signIn(page, company.worker.login, company.worker.password);
    await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

    // Trzy części: stan odbicia, jego sprawy i sprzęt dzisiejszej budowy. Nic o całej firmie.
    await expect(page.getByTestId("punch-status")).toHaveText("Nie jesteś odbity");
    const attention = page.getByRole("region", { name: "Wymaga uwagi" });
    await expect(attention.getByRole("listitem")).toHaveCount(2);
    await expect(attention).toContainText("Szkolenie BHP okresowe");
    await expect(attention).toContainText("Tarcza pęknięta");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Wymaga uwagi", "Sprzęt na Twojej budowie"]);
    await expect(page.getByRole("heading", { name: "Ostatnie ruchy" })).toHaveCount(0);
    await expect(page.getByTestId("alarm-count")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("zł");

    const equipment = page.getByRole("region", { name: "Sprzęt na Twojej budowie" });
    await expect(equipment).toContainText("Naciśnij Skanuj i zeskanuj plakat budowy");
    await expect(page.getByRole("link", { name: /S-01|W-01|H-01/ })).toHaveCount(0);
    // Na wąskim telefonie tablica się nie poszerza.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    // Skanuj z podpowiedzi otwiera skaner na tablicy; plakat Rataje odbija wejście.
    await equipment.getByRole("link", { name: "Skanuj" }).click();
    const scanner = page.getByRole("region", { name: "Skanuj" });
    await scanner.getByRole("button", { name: "Wyłącz aparat" }).click();
    await typeScanCode(page, company.posterCode);
    await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
    await page.getByRole("link", { name: "Na tablicę" }).click();

    await expect(page.getByTestId("punch-status")).toHaveText(/^Jesteś na budowie Rataje od \d{1,2}:\d{2}$/);
    const onSite = page.getByRole("region", { name: "Sprzęt na budowie Rataje" });
    await expect(onSite.getByRole("link")).toHaveText([/S-01/, /S-02/]);
    await expect(page.getByRole("link", { name: /W-01|H-01/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Wydaj|Zwróć|Przenieś/ })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("zł");

    // Podgląd: karta narzędzia bez złotówek, a sprawy prowadzą do całej skrzynki.
    await onSite.getByRole("link", { name: /S-02/ }).click();
    await expect(page.getByRole("heading", { name: /S-02/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("zł");
    await page.goBack();
    await attention.getByRole("link", { name: "Zobacz wszystkie (2)" }).click();
    await expect(page).toHaveURL(/\/dzwonek$/);
  });
});
