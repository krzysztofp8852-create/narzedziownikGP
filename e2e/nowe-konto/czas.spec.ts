import { type Locator, type Page, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";
import { expectNoHorizontalScroll } from "../support/fresh-account";
import {
  addSiteWithPin,
  buildCrew,
  closeCrew,
  type Crew,
  expect,
  north,
  punchOf,
  scanPoster,
  setPosition,
  shownMonth,
  warsawDay,
} from "../support/punch-crew";

// Nowa firma przez interfejs, dwie budowy z pinezkami i kilkanaście odbić: test jest długi.
test.describe.configure({ timeout: 360_000 });

let crew: Crew | null = null;
test.afterEach(async () => {
  if (crew) await closeCrew(crew);
  crew = null;
});

const RATAJE = { lat: 52.4, lng: 16.95 };
const WILDA = { lat: 52.39, lng: 16.92 };

function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

/** „Popraw godziny” przy odbiciu: nowe wejście i wyjście (RRRR-MM-DDTGG:MM) z powodem. */
async function correct(entry: Locator, times: { entry: string; exit: string }, reason: string) {
  await entry.getByText("Popraw godziny").click();
  await entry.getByLabel("Wejście", { exact: true }).fill(times.entry);
  await entry.getByLabel("Wyjście", { exact: true }).fill(times.exit);
  await entry.getByLabel("Powód").fill(reason);
  await entry.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(entry.getByTestId("punch-correction").last()).toContainText(`Powód: ${reason}`);
}

/** Tabela zestawienia: każdy wiersz jako lista komórek (osoba, miejsca, razem). */
async function expectTable(page: Page, month: string, rows: string[][]) {
  const table = page.getByRole("table", { name: `Czas na budowie: ${shownMonth(month)}` });
  await expect(table.getByRole("row")).toHaveCount(rows.length);
  for (const [index, cells] of rows.entries()) await expect(table.getByRole("row").nth(index).locator("th, td")).toHaveText(cells);
}

async function download(page: Page, name: string) {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Pobierz Excel" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe(name);
  const [sheet, ...others] = await readXlsxFile((await file.path())!);
  expect(others).toHaveLength(0);
  expect(sheet.sheet).toBe("Czas na budowie");
  return sheet.data;
}

const RULE = "Godziny od wejścia do wyjścia z odbić. Odbicia bez wyjścia się nie liczą.";

test("czas na budowie z odbić: przejście między budowami, poprawki godzin, sumy miesiąca, nawigacja po miesiącach i eksport do Excela; kierownik widzi swoje budowy, a pracownik swój czas", async ({
  browser,
}) => {
  const today = warsawDay();
  const day = warsawDay(-1);
  test.skip(day.slice(0, 7) !== today.slice(0, 7), "Pierwszy dzień miesiąca: wczorajsze odbicia wpadają do poprzedniego miesiąca");
  const month = today.slice(0, 7);
  const previousMonth = shiftMonth(month, -1);

  crew = await buildCrew(browser, "czas", RATAJE);
  const { owner, manager, worker } = crew;
  const rataje = crew.site;
  const wilda = await addSiteWithPin(owner.page, {
    name: "Wilda",
    address: "ul. Górna Wilda 50, Poznań",
    manager: "Jan Testowy (właściciel)",
    position: WILDA,
  });

  // Pracownik zaczyna na Ratajach, przejeżdża na Wildę jednym skanem i tam kończy.
  await setPosition(worker, { lat: RATAJE.lat + north(100), lng: RATAJE.lng });
  await scanPoster(worker.page, rataje);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await setPosition(worker, { lat: WILDA.lat + north(20), lng: WILDA.lng });
  await scanPoster(worker.page, wilda);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Przejście zapisane: Rataje → Wilda, \d{1,2}:\d{2}\.$/);
  await expect(worker.page.getByTestId("punch-check")).toHaveText("na budowie, 20 m");
  await scanPoster(worker.page, wilda);
  await worker.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Wilda/);

  // Kierownik odbija siebie i Wojciecha Lisa, potem kończy razem z nim.
  await setPosition(manager, { lat: RATAJE.lat + north(40), lng: RATAJE.lng });
  await scanPoster(manager.page, rataje);
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  let list = manager.page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wejście/);
  await scanPoster(manager.page, rataje);
  await manager.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Rataje/);
  list = manager.page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Wojciech Lis · wyjście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wyjście/);

  // Odbicia trwały kilka sekund: kierownik i właściciel wpisują prawdziwe godziny poprawkami (wczoraj i w poprzednim miesiącu).
  await manager.page.goto(`/budowy/${rataje.id}/ludzie`);
  let history = manager.page.getByRole("list", { name: "Historia odbić" });
  await correct(punchOf(history, "Piotr Kowalczyk"), { entry: `${day}T07:00`, exit: `${day}T12:00` }, "Rataje rano");
  await correct(punchOf(history, "Wojciech Lis"), { entry: `${previousMonth}-15T06:00`, exit: `${previousMonth}-15T14:15` }, "Zeszły miesiąc");
  await expect(punchOf(history, "Adam Nowak").getByText("Popraw godziny")).toHaveCount(0);

  await owner.page.goto(`/budowy/${wilda.id}/ludzie`);
  history = owner.page.getByRole("list", { name: "Historia odbić" });
  await correct(punchOf(history, "Piotr Kowalczyk"), { entry: `${day}T12:00`, exit: `${day}T15:30` }, "Wilda po południu");
  await owner.page.goto(`/budowy/${rataje.id}/ludzie`);
  await correct(punchOf(history, "Adam Nowak"), { entry: `${day}T07:30`, exit: `${day}T16:00` }, "Cały dzień na Ratajach");
  await expect(punchOf(history, "Adam Nowak").getByTestId("punch-time-on-site")).toHaveText("Czas na budowie: 8 godz. 30 min");

  // Właściciel: cała firma, osoby w wierszach, budowy w kolumnach, sumy na końcu.
  await owner.page.goto("/");
  await owner.page.getByRole("button", { name: "Menu" }).click();
  await owner.page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Czas na budowie" }).click();
  await expect(owner.page).toHaveURL("/czas");
  await expect(owner.page.getByRole("navigation", { name: "Miesiąc" }).getByRole("link", { name: "Ten miesiąc" })).toHaveAttribute("aria-current", "page");
  await expect(owner.page.getByTestId("time-on-site-total")).toHaveText("17 godz. 0 min");
  await expectTable(owner.page, month, [
    ["Osoba", "Rataje", "Wilda", "Razem"],
    ["Adam Nowak", "8 godz. 30 min", "–", "8 godz. 30 min"],
    ["Piotr Kowalczyk", "5 godz. 0 min", "3 godz. 30 min", "8 godz. 30 min"],
    ["Razem", "13 godz. 30 min", "3 godz. 30 min", "17 godz. 0 min"],
  ]);
  expect(await download(owner.page, `czas-na-budowie-${month}.xlsx`)).toEqual([
    [`Czas na budowie: ${shownMonth(month)}`, null, null, null, null],
    [RULE, null, null, null, null],
    ["Osoba", "Rataje", "Wilda", "Razem (godz.)", "Bez wyjścia"],
    ["Adam Nowak", 8.5, null, 8.5, null],
    ["Piotr Kowalczyk", 5, 3.5, 8.5, null],
    ["Razem", 13.5, 3.5, 17, null],
  ]);
  await expectNoHorizontalScroll(owner.page);

  // Poprzedni miesiąc: tylko Wojciech Lis, a plik ma ten miesiąc w nazwie.
  await owner.page.getByRole("navigation", { name: "Miesiąc" }).getByRole("link", { name: "Poprzedni miesiąc" }).click();
  await expect(owner.page).toHaveURL(`/czas?miesiac=${previousMonth}`);
  await expect(owner.page.getByTestId("time-on-site-total")).toHaveText("8 godz. 15 min");
  await expectTable(owner.page, previousMonth, [
    ["Osoba", "Rataje", "Razem"],
    ["Wojciech Lis", "8 godz. 15 min", "8 godz. 15 min"],
    ["Razem", "8 godz. 15 min", "8 godz. 15 min"],
  ]);
  expect(await download(owner.page, `czas-na-budowie-${previousMonth}.xlsx`)).toEqual([
    [`Czas na budowie: ${shownMonth(previousMonth)}`, null, null, null],
    [RULE, null, null, null],
    ["Osoba", "Rataje", "Razem (godz.)", "Bez wyjścia"],
    ["Wojciech Lis", 8.25, 8.25, null],
    ["Razem", 8.25, 8.25, null],
  ]);

  // Dowolny miesiąc z pola: dwa miesiące temu nikt nie miał odbić.
  const empty = shiftMonth(month, -2);
  await owner.page.getByRole("textbox", { name: "Miesiąc" }).fill(empty);
  await owner.page.getByRole("button", { name: "Pokaż miesiąc" }).click();
  await expect(owner.page).toHaveURL(`/czas?miesiac=${empty}`);
  await expect(owner.page.getByText("W tym miesiącu nikt nie ma odbić z wyjściem.")).toBeVisible();
  await expect(owner.page.getByTestId("time-on-site-total")).toHaveText("0 min");
  await expect(owner.page.getByRole("link", { name: "Pobierz Excel" })).toHaveCount(0);

  // Kierownik: tylko budowy, których jest kierownikiem (bez Wildy właściciela).
  await manager.page.goto("/czas");
  await expect(manager.page.getByText("Godziny osób na Twoich budowach w miesiącu, z odbić na plakatach budów.")).toBeVisible();
  await expect(manager.page.getByTestId("time-on-site-total")).toHaveText("13 godz. 30 min");
  await expectTable(manager.page, month, [
    ["Osoba", "Rataje", "Razem"],
    ["Adam Nowak", "8 godz. 30 min", "8 godz. 30 min"],
    ["Piotr Kowalczyk", "5 godz. 0 min", "5 godz. 0 min"],
    ["Razem", "13 godz. 30 min", "13 godz. 30 min"],
  ]);
  expect(await download(manager.page, `czas-na-budowie-${month}.xlsx`)).toEqual([
    [`Czas na budowie: ${shownMonth(month)}`, null, null, null],
    [RULE, null, null, null],
    ["Osoba", "Rataje", "Razem (godz.)", "Bez wyjścia"],
    ["Adam Nowak", 8.5, 8.5, null],
    ["Piotr Kowalczyk", 5, 5, null],
    ["Razem", 13.5, 13.5, null],
  ]);

  // Pracownik: własny czas w tym i poprzednim miesiącu, z odbiciami do sprawdzenia.
  await worker.page.goto("/czas");
  const thisMonth = worker.page.getByRole("region", { name: `Czas na budowie: ${shownMonth(month)}` });
  await expect(thisMonth.getByTestId("time-on-site-total")).toHaveText("8 godz. 30 min");
  await expect(thisMonth.getByRole("list", { name: "Czas na budowie" }).getByRole("listitem")).toHaveText([
    /^Rataje\s*5 godz\. 0 min$/,
    /^Wilda\s*3 godz\. 30 min$/,
  ]);
  await expect(thisMonth.getByRole("list", { name: "Odbicia" }).getByTestId("punch")).toHaveCount(2);
  const lastMonth = worker.page.getByRole("region", { name: `Czas na budowie: ${shownMonth(previousMonth)}` });
  await expect(lastMonth.getByTestId("time-on-site-total")).toHaveText("0 min");
  await expect(lastMonth.getByText("W tym miesiącu nie masz odbić.")).toBeVisible();
});
