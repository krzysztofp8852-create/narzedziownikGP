import { readFileSync } from "node:fs";
import { test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { openFreshAccount, signIn, signOut } from "../support/fresh-account";
import {
  buildCrew,
  closeCrew,
  type Crew,
  expect,
  newPhone,
  north,
  onBoard,
  punchOf,
  scanPoster,
  setPosition,
  shownDateTime,
  shownMonth,
  supportScript,
  typedCode,
  warsawDay,
} from "../support/punch-crew";

// Każdy test zakłada nową firmę przez interfejs (właściciel, kierownik, pracownik, osoba bez konta, budowa z pinezką).
test.describe.configure({ timeout: 240_000 });

let crew: Crew | null = null;
test.afterEach(async () => {
  if (crew) await closeCrew(crew);
  crew = null;
});

const at = (site: Crew["site"], meters: number, accuracy = 15) => ({ lat: site.position.lat + north(meters), lng: site.position.lng, accuracy });

test("nowe konto: plakat z kodem QR, pracownik odbija się z aparatu po zalogowaniu, drugi skan pyta „Kończysz?”, a kierownik odbija też osobę bez telefonu", async ({
  browser,
}, testInfo) => {
  crew = await buildCrew(browser, "odbicia plakat");
  const { owner, manager, worker, site } = crew;

  // Plakat do wydruku: jedna strona A4 PDF.
  const posterSection = owner.page.getByRole("region", { name: "Plakat budowy" });
  const download = owner.page.waitForEvent("download");
  await posterSection.getByRole("link", { name: "Pobierz plakat (PDF)" }).click();
  const poster = await download;
  expect(poster.suggestedFilename()).toBe("plakat-odbicia.pdf");
  const pdfPath = testInfo.outputPath("plakat.pdf");
  await poster.saveAs(pdfPath);
  const pdf = await PDFDocument.load(readFileSync(pdfPath));
  expect(pdf.getPageCount()).toBe(1);
  const { width, height } = pdf.getPage(0).getSize();
  expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);

  // Pracownik skanuje plakat aparatem telefonu, zanim się zalogował: po logowaniu wraca na stronę odbicia.
  await setPosition(worker, at(site, 100));
  await signOut(worker.page);
  await scanPoster(worker.page, site);
  await expect(worker.page).toHaveURL(/\/logowanie\?next=/);
  await worker.page.getByLabel("E-mail lub nazwa użytkownika").fill(worker.credentials.login);
  await worker.page.getByLabel("Hasło").fill(worker.credentials.password);
  await worker.page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
  await expect(worker.page.getByTestId("punch-check")).toHaveText("na budowie, 100 m");
  // Pracownik odbija tylko siebie.
  await expect(worker.page.getByRole("region", { name: "Odbij też…" })).toHaveCount(0);

  // Drugi skan tego samego plakatu: nic się nie zapisuje bez potwierdzenia, a „Nie, zostaję” zostawia go na budowie.
  await scanPoster(worker.page, site);
  await expect(worker.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await worker.page.getByRole("link", { name: "Nie, zostaję" }).click();
  await expect(worker.page).toHaveURL("/");

  // Kierownik odbija siebie i z listy „Odbij też…” osobę bez telefonu.
  await setPosition(manager, at(site, 40));
  await scanPoster(manager.page, site);
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(manager.page.getByTestId("punch-check")).toHaveText("na budowie, 40 m");
  const list = manager.page.getByRole("region", { name: "Odbij też…" });
  // Najpierw ci, którzy są tu odbici (wyjście), potem reszta po nazwisku; bez samego kierownika.
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  await expect(list.getByRole("checkbox", { name: "Piotr Kowalczyk · wyjście" })).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Jan Testowy · wejście" })).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Adam Nowak", exact: false })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Odbij zaznaczonych (0)" })).toBeDisabled();
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wejście, \d{1,2}:\d{2}$/);
  await expect(list).toContainText("na budowie, 40 m");

  // Właściciel widzi, kto jest teraz na budowie i kto kogo odbił.
  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  await expect(owner.page.getByRole("main").getByText("Teraz na budowie (3)")).toBeVisible();
  const present = owner.page.getByRole("list", { name: "Teraz na budowie" });
  await expect(present.getByTestId("punch").locator(".movement-head")).toHaveText(["Adam Nowak", "Piotr Kowalczyk", "Wojciech Lis"]);
  const lis = punchOf(present, "Wojciech Lis");
  await expect(lis.getByTestId("punch-punched-by")).toHaveText("odbił: Adam Nowak");
  await expect(lis).toContainText("Wejście: na budowie, 40 m");
  await expect(punchOf(present, "Piotr Kowalczyk")).toContainText("Wejście: na budowie, 100 m");
  await expect(punchOf(present, "Piotr Kowalczyk").getByTestId("punch-punched-by")).toHaveCount(0);

  // Pracownik kończy: trzeci skan, „Tak, kończę”.
  await scanPoster(worker.page, site);
  await worker.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Rataje, \d{1,2}:\d{2}\.$/);

  // Kierownik przy drugim skanie zostaje, ale potwierdza wyjście Wojciecha Lisa.
  await scanPoster(manager.page, site);
  await expect(manager.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Wojciech Lis · wyjście" })).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Piotr Kowalczyk · wejście" })).toBeVisible();
  await list.getByRole("checkbox", { name: "Wojciech Lis · wyjście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wyjście, \d{1,2}:\d{2}$/);

  await owner.page.reload();
  await expect(owner.page.getByRole("main").getByText("Teraz na budowie (1)")).toBeVisible();
  await expect(present.getByTestId("punch")).toHaveText(/Adam Nowak/);
  const history = owner.page.getByRole("list", { name: "Historia odbić" });
  await expect(history.getByTestId("punch")).toHaveCount(3);
  const workerPunch = punchOf(history, "Piotr Kowalczyk");
  await expect(workerPunch).toContainText("Wejście: na budowie, 100 m · Wyjście: na budowie, 100 m");
  await expect(workerPunch.getByTestId("punch-time-on-site")).toHaveText(/^Czas na budowie: \d+ min$/);
  await expect(punchOf(history, "Wojciech Lis").getByTestId("punch-punched-by")).toHaveText("odbił: Adam Nowak");
  // Nic nie jest do wyjaśnienia: wszyscy odbili się na budowie.
  await expect(history.getByText("do wyjaśnienia")).toHaveCount(0);
});

test("położenie przy skanie: 5 km od budowy, telefon bez zgody na GPS, słaba dokładność i mniejszy promień; odbicia zapisują się z oznaczeniem i trafiają do wyjaśnienia", async ({
  browser,
}) => {
  crew = await buildCrew(browser, "odbicia gps");
  const { owner, manager, worker, site } = crew;

  // Pracownik 5 km od budowy: odbicie się zapisuje, ale z oznaczeniem.
  await setPosition(worker, at(site, 5_000, 30));
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(worker.page.getByTestId("punch-check")).toHaveText("Do wyjaśnienia przez kierownika: poza budową, 5,0 km.");

  // Kierownik na drugim telefonie, który nie dał zgody na położenie.
  const blind = await newPhone(browser, "bez zgody");
  await signIn(blind.page, manager.credentials);
  await expect(blind.page.getByTestId("company-name")).toHaveText(crew.companyName);
  await scanPoster(blind.page, site);
  await expect(blind.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(blind.page.getByTestId("punch-check")).toHaveText("Do wyjaśnienia przez kierownika: brak położenia telefonu.");
  await blind.context.close();

  // Właściciel 100 m od budowy z bardzo słabą dokładnością GPS (2,5 km): dokładności Rejestr nie używa (ADR 0032).
  await setPosition(owner, at(site, 100, 2_500));
  await scanPoster(owner.page, site);
  await expect(owner.page.getByTestId("punch-check")).toHaveText("na budowie, 100 m");

  // Właściciel zmniejsza promień odbicia do 50 m; to samo miejsce jest już poza budową.
  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  const posterSection = owner.page.getByRole("region", { name: "Plakat budowy" });
  await posterSection.getByLabel("Promień odbicia (m)").fill("50");
  await posterSection.getByRole("button", { name: "Zapisz promień" }).click();
  await expect(posterSection.getByText("Promień zapisany.")).toBeVisible();
  await expect(posterSection).toContainText("Promień odbicia: 50 m");

  await scanPoster(owner.page, site);
  await expect(owner.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  const list = owner.page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wejście, \d{1,2}:\d{2}$/);
  await expect(list).toContainText("Do wyjaśnienia przez kierownika: poza budową, 100 m.");

  // Właściciel widzi wszystkie trzy oznaczone odbicia, od najnowszego; własne odbicie na budowie nie jest oznaczone.
  await owner.page.goto("/");
  await owner.page.getByRole("button", { name: "Menu" }).click();
  await owner.page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Odbicia do wyjaśnienia" }).click();
  await expect(owner.page).toHaveURL("/odbicia");
  const ownerList = owner.page.getByRole("list", { name: "Odbicia do wyjaśnienia" });
  const heads = (page: typeof owner.page) =>
    page.getByRole("list", { name: "Odbicia do wyjaśnienia" }).getByTestId("punch").locator(".movement-head > span:first-child");
  await expect(heads(owner.page)).toHaveText(["Wojciech Lis", "Adam Nowak", "Piotr Kowalczyk"]);
  await expect(punchOf(ownerList, "Piotr Kowalczyk")).toContainText("Wejście: poza budową, 5,0 km");
  await expect(punchOf(ownerList, "Adam Nowak")).toContainText("Wejście: brak położenia telefonu");
  const lis = punchOf(ownerList, "Wojciech Lis");
  await expect(lis).toContainText("Wejście: poza budową, 100 m");
  await expect(lis.getByTestId("punch-punched-by")).toHaveText("odbił: Jan Testowy");

  // Kierownik wyjaśnia odbicia na swojej budowie, ale nie własne (te zostają dla właściciela).
  await manager.page.goto("/odbicia");
  await expect(heads(manager.page)).toHaveText(["Wojciech Lis", "Piotr Kowalczyk"]);
  const managerList = manager.page.getByRole("list", { name: "Odbicia do wyjaśnienia" });
  const piotr = punchOf(managerList, "Piotr Kowalczyk");
  await piotr.getByLabel("Notatka (opcjonalnie)").fill("Telefon pokazywał dom, był na budowie");
  await piotr.getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(heads(manager.page)).toHaveText(["Wojciech Lis"]);

  await owner.page.reload();
  await expect(heads(owner.page)).toHaveText(["Wojciech Lis", "Adam Nowak"]);
  await punchOf(ownerList, "Adam Nowak").getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(heads(owner.page)).toHaveText(["Wojciech Lis"]);

  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  const present = owner.page.getByRole("list", { name: "Teraz na budowie" });
  await expect(punchOf(present, "Piotr Kowalczyk")).toContainText(
    "Wyjaśnione: Adam Nowak: Telefon pokazywał dom, był na budowie",
  );
  await expect(punchOf(present, "Adam Nowak")).toContainText("Wyjaśnione: Jan Testowy");
  await expect(punchOf(present, "Wojciech Lis")).toContainText("do wyjaśnienia");
});

test("role i kod plakatu: pracownik nie ma plakatu, poprawek, wyjaśniania ani zestawienia; „Nowy kod” kierownika unieważnia stary plakat, a kod z innej firmy nie działa", async ({
  browser,
}) => {
  crew = await buildCrew(browser, "odbicia role");
  const { manager, worker, site } = crew;

  await setPosition(worker, at(site, 20));
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);

  // Pracownik w zakładce „Ludzie na budowie” widzi swoje odbicie, ale bez plakatu i bez poprawiania godzin.
  await worker.page.goto(`/budowy/${site.id}/ludzie`);
  await expect(worker.page.getByRole("list", { name: "Teraz na budowie" }).getByTestId("punch")).toContainText("Piotr Kowalczyk");
  await expect(worker.page.getByRole("region", { name: "Plakat budowy" })).toHaveCount(0);
  await expect(worker.page.getByText("Popraw godziny")).toHaveCount(0);
  const posterResponse = await worker.page.request.get(`/plakat/${site.id}`);
  expect(posterResponse.status()).toBe(400);
  expect(await posterResponse.text()).toBe("Nie masz uprawnień do tej operacji.");

  // Bez listy do wyjaśnienia, a w menu tylko własny czas na budowie.
  await worker.page.goto("/odbicia");
  await expect(worker.page).toHaveURL("/");
  await worker.page.getByRole("button", { name: "Menu" }).click();
  const menu = worker.page.getByRole("navigation", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Odbicia do wyjaśnienia" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Czas na budowie", exact: true })).toHaveCount(0);
  await menu.getByRole("link", { name: "Mój czas na budowie" }).click();
  await expect(worker.page).toHaveURL("/czas");
  await expect(worker.page.getByText("Twoje odbicia i czas na budowie w tym i poprzednim miesiącu.", { exact: false })).toBeVisible();
  await expect(worker.page.getByRole("link", { name: "Pobierz Excel" })).toHaveCount(0);
  await expect(worker.page.getByRole("textbox", { name: "Miesiąc" })).toHaveCount(0);
  await expect(worker.page.getByRole("list", { name: "Odbicia" }).first().getByTestId("punch")).toContainText(/– teraz/);
  expect((await worker.page.request.get("/czas/eksport")).status()).toBe(403);

  // Kierownik budowy drukuje jej plakat i zmienia kod, ale promień odbicia zmienia tylko właściciel.
  await manager.page.goto(`/budowy/${site.id}/ludzie`);
  const posterSection = manager.page.getByRole("region", { name: "Plakat budowy" });
  await expect(posterSection.getByRole("link", { name: "Pobierz plakat (PDF)" })).toBeVisible();
  await expect(posterSection).toContainText("Promień odbicia: 300 m");
  await expect(posterSection.getByLabel("Promień odbicia (m)")).toHaveCount(0);
  await posterSection.getByRole("button", { name: "Nowy kod" }).click();
  await expect(posterSection).toContainText("Stary plakat przestanie działać i trzeba będzie powiesić nowy. Zmienić kod?");
  await posterSection.getByRole("button", { name: "Tak, nowy kod" }).click();
  await expect(posterSection.getByText("Kod zmieniony. Pobierz i powieś nowy plakat.")).toBeVisible();
  await expect(posterSection).not.toContainText(typedCode(site));
  const newCodeText = await posterSection.getByText(/^Kod plakatu do wpisania ręcznie: /).innerText();
  const newCode = /([0-9A-Z]{5})-([0-9A-Z]{5})$/.exec(newCodeText)!.slice(1).join("");
  expect(newCode).not.toBe(site.posterCode);

  // Zdjęcie starego plakatu już nie działa.
  await scanPoster(worker.page, site);
  await expect(worker.page.getByRole("main").getByRole("alert")).toHaveText(
    "Ten kod plakatu nie działa: plakat jest nieaktualny albo z innej firmy. Poproś kierownika budowy o nowy plakat.",
  );

  // Skaner w programie: zły tekst to nie plakat, a nowy kod przepisany małymi literami ze spacją działa.
  await worker.page.goto("/");
  const scanner = worker.page.getByRole("region", { name: "Odbij się" });
  await scanner.getByRole("button", { name: "Odbij się" }).click();
  await scanner.getByRole("button", { name: "Wyłącz aparat" }).click();
  await scanner.getByLabel("Kod z plakatu").fill("H-03");
  await scanner.getByRole("button", { name: "Dalej" }).click();
  await expect(scanner.getByText("To nie jest kod plakatu budowy.")).toBeVisible();
  await scanner.getByLabel("Kod z plakatu").fill(`${newCode.slice(0, 5).toLowerCase()} ${newCode.slice(5).toLowerCase()}`);
  await scanner.getByRole("button", { name: "Dalej" }).click();
  await expect(worker.page).toHaveURL(`/odbicie/${newCode}`);
  // Nowy kod nie przerywa pobytu: skan na tej samej budowie to wyjście.
  await expect(worker.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await worker.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Rataje/);

  // Właściciel innej firmy z tym samym kodem nie odbije się na cudzej budowie.
  const stranger = await newPhone(browser, site.position);
  await openFreshAccount(stranger.page, "odbicia obca firma");
  await stranger.page.goto(`/odbicie/${newCode}`);
  await expect(stranger.page.getByRole("main").getByRole("alert")).toHaveText(
    "Ten kod plakatu nie działa: plakat jest nieaktualny albo z innej firmy. Poproś kierownika budowy o nowy plakat.",
  );
  expect((await stranger.page.request.get(`/plakat/${site.id}`)).status()).toBe(400);
  await stranger.context.close();
});

test("bez zasięgu: wyjście czeka w kolejce i dochodzi z oznaczeniem „zapisane offline”, a skan sprzed późniejszego odbicia kierownika trafia do wyjaśnienia", async ({
  browser,
}) => {
  crew = await buildCrew(browser, "odbicia offline");
  const { owner, manager, worker, site } = crew;
  await setPosition(worker, at(site, 50));
  await setPosition(manager, at(site, 30));
  const pending = (page: typeof worker.page) => page.getByTestId("pending-count");

  async function scanOffline(page: typeof worker.page, { firstTime = false } = {}) {
    const scanner = page.getByRole("region", { name: "Odbij się" });
    await scanner.getByRole("button", { name: "Odbij się" }).click();
    // Wyłączony aparat zostaje wyłączony przy następnym otwarciu skanera.
    if (firstTime) await scanner.getByRole("button", { name: "Wyłącz aparat" }).click();
    await scanner.getByLabel("Kod z plakatu").fill(typedCode(site));
    await scanner.getByRole("button", { name: "Dalej" }).click();
  }

  // Wejście z siecią: telefon poznaje nazwę budowy z kodu.
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await worker.page.getByRole("link", { name: "Na tablicę" }).click();
  await onBoard(worker.page);

  // Wyjście bez zasięgu: telefon sam wie, że pracownik jest tu odbity, więc pyta „Kończysz?”.
  await worker.context.setOffline(true);
  await scanOffline(worker.page, { firstTime: true });
  await expect(worker.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await expect(worker.page.locator(".punch-flow strong")).toHaveText("Rataje");
  await worker.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(worker.page.getByTestId("punch-queued")).toHaveText(
    /^Brak zasięgu\. Wyjście zapisane w telefonie: Rataje, \d{1,2}:\d{2}\. Wyślę je sam, gdy wróci sieć\.$/,
  );
  await worker.page.getByRole("button", { name: "Na tablicę" }).click();
  await expect(pending(worker.page)).toHaveText("⏳ Oczekuje: 1");
  await pending(worker.page).click();
  await expect(worker.page.getByRole("list", { name: "Czekające na sieć" }).getByRole("listitem")).toHaveText([/Odbicie, wyjście: Rataje/]);
  await worker.context.setOffline(false);
  await expect(pending(worker.page)).toHaveCount(0);

  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  const history = owner.page.getByRole("list", { name: "Historia odbić" });
  await expect(history.getByTestId("punch")).toHaveCount(1);
  await expect(history.getByTestId("punch")).toContainText("Wejście: na budowie, 50 m · Wyjście: na budowie, 50 m (zapisane offline)");

  // Następnego wejścia pracownik znowu odbija z siecią, a wyjście bez zasięgu.
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await worker.page.getByRole("link", { name: "Na tablicę" }).click();
  await onBoard(worker.page);
  await worker.context.setOffline(true);
  await scanOffline(worker.page);
  await worker.page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(worker.page.getByTestId("punch-queued")).toContainText("Brak zasięgu. Wyjście zapisane w telefonie: Rataje");
  await worker.page.getByRole("button", { name: "Na tablicę" }).click();
  await expect(pending(worker.page)).toHaveText("⏳ Oczekuje: 1");

  // W międzyczasie kierownik z siecią odbija wyjście pracownika i wejście osoby bez telefonu.
  await scanPoster(manager.page, site);
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  const list = manager.page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Piotr Kowalczyk · wyjście" }).check();
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (2)" }).click();
  await expect(list.getByTestId("punch-people-done").getByRole("listitem")).toHaveText([
    /^Piotr Kowalczyk: wyjście, \d{1,2}:\d{2}$/,
    /^Wojciech Lis: wejście, \d{1,2}:\d{2}$/,
  ]);

  // Sieć wraca: wyjście z telefonu jest starsze niż wyjście odbite przez kierownika, więc nie zapisuje się, tylko czeka na wyjaśnienie.
  await worker.context.setOffline(false);
  await expect(pending(worker.page)).toHaveCount(0);
  await owner.page.goto("/odbicia");
  const conflicts = owner.page.getByRole("list", { name: "Odbicia offline niezapisane" });
  await expect(conflicts.getByTestId("punch-conflict")).toHaveCount(1);
  const conflict = conflicts.getByTestId("punch-conflict");
  await expect(conflict).toContainText("Piotr Kowalczyk");
  await expect(conflict).toContainText(/Skan w telefonie \d{1,2}\.\d{2}\.\d{4}, \d{1,2}:\d{2}: wyjście potwierdzone „Kończysz\?”\. Dotarł/);
  await expect(conflict).toContainText("w międzyczasie zapisano późniejsze odbicie tej osoby · na budowie, 50 m");

  // Kierownik budowy też widzi ten skan i go wyjaśnia.
  await manager.page.goto("/odbicia");
  const managerConflicts = manager.page.getByRole("list", { name: "Odbicia offline niezapisane" });
  await expect(managerConflicts.getByTestId("punch-conflict")).toHaveCount(1);
  await managerConflicts.getByLabel("Notatka (opcjonalnie)").fill("Wyjście odbiłem sam");
  await managerConflicts.getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(manager.page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();
  await owner.page.reload();
  await expect(owner.page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();

  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  // Wyjście drugiego pobytu pracownika odbił kierownik, a nie telefon pracownika.
  const workerPunches = punchOf(history, "Piotr Kowalczyk");
  await expect(workerPunches).toHaveCount(2);
  await expect(workerPunches.first().getByTestId("punch-punched-by")).toHaveText("wyjście odbił: Adam Nowak");
});

// Po skanie plakatu z siecią, który zapisał własne wejście kierownika, telefon gubił listę „Odbij też…” (afterOutcome
// w src/lib/offline/punch-state.ts zwracał stan bez `people`), więc bez zasięgu lista się nie pokazywała (ADR 0034).
test("kierownik bez zasięgu odbija wyjście osoby z kartoteki z listy „Odbij też…” zapamiętanej przy porannym skanie z siecią", async ({ browser }) => {
  crew = await buildCrew(browser, "odbicia offline lista");
  const { owner, manager, site } = crew;
  await setPosition(manager, at(site, 30));

  // Rano z siecią: kierownik odbija siebie i Wojciecha Lisa.
  await scanPoster(manager.page, site);
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  const list = manager.page.getByRole("region", { name: "Odbij też…" });
  await list.getByRole("checkbox", { name: "Wojciech Lis · wejście" }).check();
  await list.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(list.getByTestId("punch-people-done")).toHaveText(/^Wojciech Lis: wejście/);
  await manager.page.getByRole("link", { name: "Na tablicę" }).first().click();
  await onBoard(manager.page);

  // Po południu bez zasięgu: telefon pyta kierownika „Kończysz?” i pokazuje listę z porannego skanu.
  await manager.context.setOffline(true);
  const scanner = manager.page.getByRole("region", { name: "Odbij się" });
  await scanner.getByRole("button", { name: "Odbij się" }).click();
  await scanner.getByRole("button", { name: "Wyłącz aparat" }).click();
  await scanner.getByLabel("Kod z plakatu").fill(typedCode(site));
  await scanner.getByRole("button", { name: "Dalej" }).click();
  await expect(manager.page.getByText("Kończysz na tej budowie?")).toBeVisible();
  const offlineList = manager.page.getByRole("region", { name: "Odbij też…" });
  await expect(offlineList).toContainText("Lista z ostatniego odbicia z zasięgiem.");
  await offlineList.getByRole("checkbox", { name: "Wojciech Lis · wyjście" }).check();
  await offlineList.getByRole("button", { name: "Odbij zaznaczonych (1)" }).click();
  await expect(offlineList.getByTestId("punch-people-done")).toHaveText(
    /^Brak zasięgu\. Odbicia 1 os\. zapisane w telefonie: Rataje, \d{1,2}:\d{2}\. Wyślę je sam, gdy wróci sieć\.$/,
  );
  // Sam kierownik zostaje na budowie.
  await manager.page.getByRole("button", { name: "Nie, zostaję" }).click();
  await expect(manager.page.getByTestId("pending-count")).toHaveText("⏳ Oczekuje: 1");
  await manager.context.setOffline(false);
  await expect(manager.page.getByTestId("pending-count")).toHaveCount(0);

  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  await expect(owner.page.getByRole("main").getByText("Teraz na budowie (1)")).toBeVisible();
  const lis = punchOf(owner.page.getByRole("list", { name: "Historia odbić" }), "Wojciech Lis");
  await expect(lis).toContainText("Wejście: na budowie, 30 m · Wyjście: na budowie, 30 m (zapisane offline)");
  await expect(lis.getByTestId("punch-punched-by")).toHaveText("odbił: Adam Nowak");
});

test("zapomniane wyjście: wczorajsze odbicie zamyka się o północy „bez wyjścia” i nie liczy się do czasu, kierownik uzupełnia wyjście z powodem, a poprawki pilnują godzin", async ({
  browser,
}) => {
  const yesterday = warsawDay(-1);
  const month = yesterday.slice(0, 7);
  crew = await buildCrew(browser, "odbicia zapomniane");
  const { owner, manager, worker, site } = crew;

  await setPosition(worker, at(site, 60));
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);

  // Pracownik naprawdę wszedł wczoraj o 7:00: właściciel poprawia godzinę wejścia (z powodem, bez godziny z przyszłości).
  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  const open = punchOf(owner.page.getByRole("list", { name: "Teraz na budowie" }), "Piotr Kowalczyk");
  await open.getByText("Popraw godziny").click();
  await open.getByLabel("Wejście", { exact: true }).fill(`${warsawDay(1)}T07:00`);
  await open.getByLabel("Powód").fill("Odbił się wczoraj rano");
  await open.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(open.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await open.getByLabel("Wejście", { exact: true }).fill(`${yesterday}T07:00`);
  await open.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(open.getByTestId("punch-correction")).toContainText(
    `→ ${shownDateTime(yesterday, "07:00")}. Powód: Odbił się wczoraj rano (Jan Testowy,`,
  );

  // Północ: zadanie dzienne zamyka odbicia bez wyjścia (tylko w tej firmie testowej).
  expect(JSON.parse(supportScript("close-forgotten-exits.mts", crew.companyId))).toEqual({ punches: 1 });

  // Odbicie bez wyjścia nie liczy się do czasu: pracownik widzi to u siebie, właściciel w zestawieniu.
  await worker.page.goto("/czas");
  const ownMonth = worker.page.getByRole("region", { name: `Czas na budowie: ${shownMonth(month)}` });
  await expect(ownMonth.getByTestId("time-on-site-total")).toHaveText("0 min");
  await expect(ownMonth).toContainText("Odbicia bez wyjścia, które się nie liczą: 1");
  await expect(ownMonth.getByTestId("punch")).toContainText(`${shownDateTime(yesterday, "07:00")} – bez wyjścia`);

  await owner.page.goto("/czas");
  await owner.page.getByRole("textbox", { name: "Miesiąc" }).fill(month);
  await owner.page.getByRole("button", { name: "Pokaż miesiąc" }).click();
  await expect(owner.page).toHaveURL(`/czas?miesiac=${month}`);
  const table = owner.page.getByRole("table", { name: `Czas na budowie: ${shownMonth(month)}` });
  await expect(table.getByRole("row", { name: /Piotr Kowalczyk/ })).toContainText("Odbicia bez wyjścia, które się nie liczą: 1");
  await expect(owner.page.getByTestId("time-on-site-total")).toHaveText("0 min");

  // Kierownik budowy dostaje odbicie do wyjaśnienia i uzupełnia wyjście; wyjście przed wejściem nie przejdzie.
  await manager.page.goto("/");
  await manager.page.getByRole("button", { name: "Menu" }).click();
  await manager.page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Odbicia do wyjaśnienia" }).click();
  const forgotten = punchOf(manager.page.getByRole("list", { name: "Odbicia do wyjaśnienia" }), "Piotr Kowalczyk");
  await expect(forgotten).toContainText(`${shownDateTime(yesterday, "07:00")} – bez wyjścia`);
  await expect(forgotten).toContainText("Wyjście: bez wyjścia, zamknięte o północy");
  await expect(forgotten.getByTestId("punch-time-on-site")).toHaveText("Nie liczy się do czasu na budowie, dopóki ktoś nie uzupełni wyjścia.");
  await forgotten.getByText("Popraw godziny").click();
  await expect(forgotten.getByLabel("Wyjście", { exact: true })).toHaveValue("");
  await forgotten.getByLabel("Wyjście", { exact: true }).fill(`${yesterday}T06:00`);
  await forgotten.getByLabel("Powód").fill("Zapomniał odbić, potwierdził brygadzista");
  await forgotten.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(forgotten.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await forgotten.getByLabel("Wyjście", { exact: true }).fill(`${yesterday}T15:30`);
  await forgotten.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(manager.page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();

  // Dziś pracownik odbija się normalnie: wczorajsze odbicie jest zamknięte, więc to wejście, a nie „Kończysz?”.
  await scanPoster(worker.page, site);
  await expect(worker.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await scanPoster(manager.page, site);
  await expect(manager.page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);

  await manager.page.goto(`/budowy/${site.id}/ludzie`);
  const history = manager.page.getByRole("list", { name: "Historia odbić" });
  const filled = punchOf(history, "Piotr Kowalczyk").last();
  await expect(filled).toContainText(`${shownDateTime(yesterday, "07:00")} – 15:30`);
  await expect(filled).toContainText("Wyjście: uzupełnione poprawką");
  await expect(filled.getByTestId("punch-correction")).toHaveText([
    new RegExp(`^Poprawka wejścia: .+ → ${shownDateTime(yesterday, "07:00")}\\. Powód: Odbił się wczoraj rano \\(Jan Testowy, `),
    new RegExp(`^Uzupełnione wyjście: ${shownDateTime(yesterday, "15:30")}\\. Powód: Zapomniał odbić, potwierdził brygadzista \\(Adam Nowak, `),
  ]);
  await expect(filled.getByTestId("punch-time-on-site")).toHaveText("Czas na budowie: 8 godz. 30 min");

  // Dzisiejsze wejście nie może zachodzić na wczorajszy pobyt.
  const present = manager.page.getByRole("list", { name: "Teraz na budowie" });
  const today = punchOf(present, "Piotr Kowalczyk");
  await today.getByText("Popraw godziny").click();
  await today.getByLabel("Wejście", { exact: true }).fill(`${yesterday}T15:00`);
  await today.getByLabel("Powód").fill("Test nachodzenia");
  await today.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(today.getByRole("alert")).toHaveText("Ta godzina nachodzi na inne odbicie tej osoby. Popraw najpierw tamto odbicie.");
  // Własnych odbić kierownik nie poprawia (poprawia je właściciel).
  await expect(punchOf(present, "Adam Nowak").getByText("Popraw godziny")).toHaveCount(0);
  await owner.page.goto(`/budowy/${site.id}/ludzie`);
  await expect(punchOf(owner.page.getByRole("list", { name: "Teraz na budowie" }), "Adam Nowak").getByText("Popraw godziny")).toHaveCount(1);
  // Pracownik nie poprawia nawet własnych godzin.
  await worker.page.goto(`/budowy/${site.id}/ludzie`);
  await expect(worker.page.getByRole("list", { name: "Historia odbić" }).getByTestId("punch")).toHaveCount(2);
  await expect(worker.page.getByText("Popraw godziny")).toHaveCount(0);

  // Uzupełnione wyjście od razu liczy się do czasu; dzisiejsze odbicie trwa, więc jeszcze się nie liczy.
  await worker.page.goto("/czas");
  await expect(ownMonth.getByTestId("time-on-site-total")).toHaveText("8 godz. 30 min");
  await expect(ownMonth).not.toContainText("Odbicia bez wyjścia");
  await owner.page.goto(`/czas?miesiac=${month}`);
  await expect(table.getByRole("row", { name: /Piotr Kowalczyk/ })).toContainText("8 godz. 30 min");
  await expect(table.getByRole("row", { name: /Piotr Kowalczyk/ })).not.toContainText("bez wyjścia");
});
