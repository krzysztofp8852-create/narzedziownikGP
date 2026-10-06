import { execFileSync } from "node:child_process";
import { type Page, test } from "@playwright/test";
import { expectNoHorizontalScroll, firstSignIn, openFreshAccount } from "../support/fresh-account";
import {
  addCategory,
  addManager,
  addSite,
  addTool,
  addWorker,
  expect,
  openOperation,
  plDay,
  secondPhone,
  skipTutorial,
  warsawDay,
  zl,
} from "../support/equipment";

test.use({ actionTimeout: 20_000 });

/**
 * Stawki z ustawień, zestawienie kosztów z własnym zakresem i raporty na nowym koncie. Firma: kierownik Adam Nowak
 * z budową Rataje, pracownik, młot H-01 (3200 zł) i minikoparka M-01 z wypożyczalni (450 zł/dobę, wartość 50 000 zł)
 * na Rataje, szlifierka S-01 (450,50 zł) na bazie.
 */
async function givenCompany(page: Page, label: string) {
  const account = await openFreshAccount(page, label);
  await skipTutorial(page);
  const nowak = await addManager(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik" });
  const worker = await addWorker(page, { firstName: "Marek", lastName: "Zieliński", username: "marek.zielinski" });
  await addSite(page, { name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", manager: "Adam Nowak" });
  let body = await openOperation(page, "Dodaj narzędzie");
  await addCategory(body, "Młoty", "H");
  await addCategory(body, "Szlifierki", "S");
  await addCategory(body, "Maszyny", "M");
  await page.reload();
  body = await openOperation(page, "Dodaj narzędzie");
  await addTool(body, { category: "Młoty (H)", name: "Młot Hilti", value: "3200", code: "H-01" });
  await addTool(body, { category: "Szlifierki (S)", name: "Szlifierka kątowa", value: "450,50", code: "S-01" });

  // Właściciel przyjmuje wynajęte od razu na budowę kierownika.
  body = await openOperation(page, "Sprzęt wynajęty");
  await body.getByLabel("Gdzie stoi").selectOption({ label: "Rataje" });
  await body.getByLabel("Kategoria").selectOption({ label: "Maszyny" });
  await body.getByLabel("Nazwa", { exact: true }).fill("Minikoparka Kubota");
  await body.getByLabel("Wypożyczalnia").fill("Ramirent");
  await body.getByLabel("Stawka dobowa (zł)").fill("450");
  await body.getByLabel("Termin zwrotu").fill(warsawDay(3));
  await body.getByLabel("Wartość (zł, opcjonalnie)").fill("50000");
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("status")).toContainText("Przyjęto M-01 Minikoparka Kubota: Rataje.");

  body = await openOperation(page, "Wydaj z bazy");
  await body.getByRole("checkbox", { name: "H-01 Młot Hilti" }).check();
  await body.getByRole("button", { name: "Zatwierdź ✓" }).click();
  await expect(body.getByRole("status").first()).toContainText("Zapisano: H-01 → Rataje");
  return { ...account, nowak, worker };
}

test("stawki z ustawień: 0% dla kategorii, zły procent odrzucony; zestawienie kosztów z własnym zakresem i miesiącem", async ({ page }) => {
  test.setTimeout(240_000);
  await givenCompany(page, "koszty");

  // Przed pierwszą stawką firmy zestawienie zachęca do jej ustawienia.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Koszty sprzętu" }).click();
  await expect(page.getByRole("heading", { name: "Ustaw stawkę dzienną" })).toBeVisible();
  await page.getByRole("link", { name: "Ustaw stawkę dzienną w ustawieniach" }).click();
  await expect(page).toHaveURL(/\/ustawienia#stawki$/);

  const rates = page.getByRole("region", { name: "Stawki dzienne" });
  await expect(rates.getByLabel("Stawka firmy (% wartości na dzień)")).toHaveValue("1");
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").fill("150");
  await rates.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(rates.getByRole("alert")).toHaveText("Podaj procent od 0 do 100, najwyżej z dwoma miejscami po przecinku.");
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").fill("1,255");
  await rates.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(rates.getByRole("alert")).toHaveText("Podaj procent od 0 do 100, najwyżej z dwoma miejscami po przecinku.");
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").fill("");
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").evaluate((input: HTMLInputElement) => input.removeAttribute("required"));
  await rates.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(rates.getByRole("alert")).toHaveText("Podaj stawkę firmy.");
  // 2% dla firmy, a młoty za darmo: 0% to ważna stawka kategorii.
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").fill("2");
  await rates.getByLabel("Młoty (% wartości na dzień)").fill("0");
  await rates.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(rates.getByRole("status")).toHaveText("Zapisano.");
  await page.reload();
  await expect(rates.getByText(`Koszty liczą się od ${plDay(warsawDay(0))} wstecz przez całą historię.`, { exact: false })).toBeVisible();
  await expect(rates.getByLabel("Młoty (% wartości na dzień)")).toHaveValue("0");

  // Karta młota: stawka kategorii 0%; szlifierka na bazie: 2% wartości, ale baza nie kosztuje.
  await page.goto("/narzedzia");
  await page.getByTestId("tools-list").getByRole("link", { name: /H-01/ }).click();
  await expect(detail(page, "Stawka dzienna")).toHaveText(/^0,00\s*zł za dzień \(0% wartości, stawka kategorii\)$/);
  await page.goto("/narzedzia");
  await page.getByTestId("tools-list").getByRole("link", { name: /S-01/ }).click();
  await expect(detail(page, "Stawka dzienna")).toHaveText(/^9,01\s*zł za dzień \(2% wartości, stawka firmy\)$/);

  // Zestawienie: tylko Rataje (baza nie ma kosztów), koparka 450,00 i młot 0,00.
  await page.goto("/koszty");
  const today = warsawDay(0);
  await expect(page.getByTestId("cost-total")).toHaveText(zl("450,00"));
  await expect(page.getByText(`Okres: ${plDay(`${today.slice(0, 7)}-01`)} – ${plDay(today)}`)).toBeVisible();
  const sites = page.getByRole("list", { name: "Budowy" });
  await expect(sites.getByRole("link")).toHaveText([/Rataje[\s\S]*2 szt\.[\s\S]*450,00\s*zł/]);
  await expect(page.getByRole("list", { name: "Pojazdy" })).toHaveCount(0);

  // Własny zakres: dziś liczy się, jutro jeszcze nie.
  const range = page.getByRole("form", { name: "Własny zakres" });
  await range.getByLabel("Od").fill(today);
  await range.getByLabel("Do").fill(today);
  await range.getByRole("button", { name: "Pokaż zakres" }).click();
  await expect(page).toHaveURL(new RegExp(`/koszty\\?od=${today}&do=${today}$`));
  await expect(page.getByTestId("cost-total")).toHaveText(zl("450,00"));
  const tomorrow = warsawDay(1);
  await range.getByLabel("Od").fill(tomorrow);
  await range.getByLabel("Do").fill(warsawDay(2));
  await range.getByRole("button", { name: "Pokaż zakres" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("0,00"));
  // Aktywna budowa jest w zestawieniu także z zerową kwotą.
  await expect(sites.getByRole("link")).toHaveText([/Rataje[\s\S]*0 szt\.[\s\S]*0,00\s*zł/]);

  // Zakładka „Koszty” budowy z tym samym zakresem prowadzi z zestawienia; cała budowa to dziś.
  await page.goto(`/koszty?od=${today}&do=${today}`);
  await sites.getByRole("link", { name: /Rataje/ }).click();
  await expect(page).toHaveURL(new RegExp(`/budowy/[0-9a-f-]{36}/koszty\\?od=${today}&do=${today}$`));
  const costs = page.getByRole("list", { name: "Koszt sprzętu" });
  await expect(costs.getByRole("link")).toHaveText([/H-01[\s\S]*1 dzień × 0,00\s*zł/, /M-01[\s\S]*1 dzień × 450,00\s*zł/]);
  await page.getByRole("navigation", { name: "Okres" }).getByRole("link", { name: "Cała budowa" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("450,00"));
  await expect(page.getByText(`${plDay(today)} – ${plDay(today)}, 2 szt.`)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("raporty: na teraz i z harmonogramu; właściciel oba, kierownik tylko piątkowy swojej budowy, pracownik żadnego", async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const company = await givenCompany(page, "raporty");
  const today = plDay(warsawDay(0));

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Raporty" }).click();
  await expect(page).toHaveURL(/\/raporty$/);
  await expect(page.getByRole("heading", { name: "Raporty", level: 1 })).toBeVisible();
  await expect(page.getByText("Raport tygodniowy przychodzi do dzwonka w poniedziałek o 7:00", { exact: false })).toBeVisible();
  const live = page.getByRole("region", { name: "Na teraz" });
  await expect(live.getByRole("link")).toHaveText([/Raport tygodniowy\s*Stan w tej chwili/, /Raport piątkowy\s*Stan w tej chwili/]);
  const received = page.getByRole("region", { name: "Otrzymane" });
  await expect(received).toContainText("Jeszcze nie przyszedł żaden raport.");

  // Tygodniowy na teraz: wartość poza bazą liczy też wynajęte z wartością (3200 + 50 000), a termin zwrotu jest w terminach.
  await live.getByRole("link", { name: /Raport tygodniowy/ }).click();
  await expect(page).toHaveURL(/\/raporty\/tygodniowy$/);
  await expect(page.getByRole("heading", { name: "Raport tygodniowy", level: 1 })).toBeVisible();
  await expect(page.getByText(`Stan w tej chwili, ${today}`)).toBeVisible();
  const offBase = page.getByRole("region", { name: "Sprzęt poza bazą" });
  await expect(offBase.locator("p").first()).toHaveText(zl("53 200,00"));
  await expect(offBase).toContainText("Brak raportu z poprzedniego tygodnia do porównania.");
  const deadlines = page.getByRole("region", { name: "Terminy w najbliższych 30 dniach i po terminie" });
  await expect(deadlines.getByRole("link", { name: /M-01/ })).toContainText(
    `Termin zwrotu: termin ${plDay(warsawDay(3))} · na budowie Rataje · kierownik: Adam Nowak`,
  );
  await expect(page.getByRole("region", { name: "Najdłużej nieużywane na bazie" }).getByRole("link")).toHaveText([/S-01/]);
  await expect(page.getByRole("region", { name: "Zaginione" })).toContainText("Nic nie zaginęło.");
  await expect(page.getByRole("region", { name: /^Ponad progiem/ })).toContainText("Żadne narzędzie nie stoi na budowie dłużej niż próg.");
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "← Wszystkie raporty" }).click();
  await live.getByRole("link", { name: /Raport piątkowy/ }).click();
  await expect(page).toHaveURL(/\/raporty\/piatkowy$/);
  const rataje = page.getByRole("region", { name: "Rataje · kierownik: Adam Nowak" });
  await expect(rataje.getByRole("link")).toHaveText([/H-01[\s\S]*0 dni na miejscu/, /M-01[\s\S]*0 dni na miejscu/]);
  await expect(page.getByText("Sprzęt poza bazą przed weekendem.", { exact: false })).toHaveCount(0);
  await page.goto("/raporty/miesieczny");
  await expect(page).toHaveURL(/\/raporty$/);

  // Zadanie harmonogramu tylko dla tej firmy: piątkowy z najbliższego piątku i tygodniowy z najbliższego poniedziałku.
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/send-reports.mts", company.companyId], { encoding: "utf8" });
  const sent = JSON.parse(output.trim().split("\n").at(-1)!) as { friday: string; monday: string; sent: { friday: number; weekly: number } };
  expect(sent.sent).toEqual({ friday: 1, weekly: 1 });
  const weeklyRow = new RegExp(`Raport tygodniowy\\s*Stan na ${plDay(sent.monday)} · poza bazą 53\\s200,00\\s*zł`);
  const fridayRow = new RegExp(`Raport piątkowy\\s*Stan na ${plDay(sent.friday)} · poza bazą: 2 szt\\.`);
  await page.goto("/raporty");
  await expect(received.getByRole("link")).toHaveText(sent.monday > sent.friday ? [weeklyRow, fridayRow] : [fridayRow, weeklyRow]);
  await received.getByRole("link", { name: /Raport piątkowy/ }).click();
  await expect(page).toHaveURL(new RegExp(`/raporty/piatkowy/${sent.friday}$`));
  await expect(page.getByText(`Stan na ${plDay(sent.friday)}`)).toBeVisible();
  await expect(page.getByText("Sprzęt poza bazą przed weekendem. Zwieź na bazę, czego nie będzie trzeba w poniedziałek.")).toBeVisible();
  await expect(rataje.getByRole("link")).toHaveText([/H-01/, /M-01/]);
  await page.goto("/raporty/piatkowy/2020-01-03");
  await expect(page.getByText("Nie ma tu takiego raportu.", { exact: false })).toBeVisible();
  await page.goto("/dzwonek");
  await expect(page.getByText("Przed weekendem poza bazą: 2 szt.")).toBeVisible();

  // Kierownik: tylko piątkowy, ze swoją budową.
  const manager = await secondPhone(browser, testInfo);
  await firstSignIn(manager, company.nowak.email, company.nowak.temporaryPassword, company.companyName);
  await skipTutorial(manager);
  await manager.goto("/raporty");
  await expect(manager.getByText("Raport piątkowy przychodzi do dzwonka w piątek o 16:00", { exact: false })).toBeVisible();
  await expect(manager.getByRole("region", { name: "Na teraz" }).getByRole("link")).toHaveText([/Raport piątkowy/]);
  await expect(manager.getByRole("region", { name: "Otrzymane" }).getByRole("link")).toHaveText([fridayRow]);
  await manager.goto("/raporty/tygodniowy");
  await expect(manager).toHaveURL(/\/raporty$/);
  await manager.goto(`/raporty/tygodniowy/${sent.monday}`);
  await expect(manager.getByText("Nie ma tu takiego raportu.", { exact: false })).toBeVisible();
  await manager.goto(`/raporty/piatkowy/${sent.friday}`);
  await expect(manager.getByRole("region", { name: "Rataje · kierownik: Adam Nowak" }).getByRole("link")).toHaveText([/H-01/, /M-01/]);
  await expectNoHorizontalScroll(manager);

  // Pracownik: bez raportów i kosztów; widzi wynajęte na liście, ale bez złotówek i bez zwrotu do wypożyczalni.
  await manager.getByRole("button", { name: "Menu" }).click();
  await manager.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: "Wyloguj" }).click();
  await expect(manager).toHaveURL(/\/logowanie$/);
  const worker = manager;
  await firstSignIn(worker, company.worker.username, company.worker.temporaryPassword, company.companyName);
  await skipTutorial(worker);
  await worker.getByRole("button", { name: "Menu" }).click();
  const menu = worker.getByRole("navigation", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Narzędzia" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Raporty" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Koszty sprzętu" })).toHaveCount(0);
  await worker.getByRole("button", { name: "Menu" }).click();
  await worker.goto("/raporty");
  await expect(worker).toHaveURL(/\/$/);
  await worker.goto("/raporty/piatkowy");
  await expect(worker).toHaveURL(/\/raporty$|\/$/);
  await worker.goto("/koszty");
  await expect(worker).toHaveURL(/\/$/);
  await worker.goto("/narzedzia");
  const list = worker.getByTestId("tools-list");
  await expect(list.getByRole("link")).toHaveText([/H-01/, /M-01/, /S-01/]);
  await expect(list.getByRole("link", { name: /M-01/ })).toContainText("wynajęte");
  await expect(worker.getByTestId("tools-count")).toHaveText("Narzędzia: 3");
  await expect(worker.locator("main")).not.toContainText("zł");
  await list.getByRole("link", { name: /M-01/ }).click();
  await expect(worker.getByTestId("tool-rental")).toHaveText(/Z wypożyczalni Ramirent\.$/);
  await expect(worker.locator("summary", { hasText: "Zwrot do wypożyczalni" })).toHaveCount(0);
  await expect(worker.locator("summary", { hasText: "Przedłuż wynajem" })).toHaveCount(0);
  await expect(worker.locator("main")).not.toContainText("zł");
  await worker.context().close();
});

/** Wartość z listy „Dane” na karcie narzędzia. */
function detail(page: Page, label: string) {
  return page.locator("dl.details > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
}
