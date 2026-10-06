import { type Locator, type Page, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";
import { expectNoHorizontalScroll, firstSignIn, openFreshAccount } from "../support/fresh-account";
import { addCategory, addManager, addSite, addTool, expect, money, openOperation, plDay, secondPhone, skipTutorial, warsawDay, zl } from "../support/equipment";

/**
 * Sprzęt własny i wynajęty na nowym koncie, wszystko przez interfejs: właściciel zakłada kierownika i budowę, dodaje
 * narzędzia z wartością, przyjmuje sprzęt z wypożyczalni z terminem zwrotu i stawką dobową, wydaje go checklistą na
 * budowę, sprawdza koszty, a na końcu oddaje sprzęt do wypożyczalni. Wszystkie ruchy są z dziś, więc każde narzędzie
 * na budowie to dokładnie jedna rozpoczęta doba: koszt = stawka, niezależnie od godziny testu.
 */

test.use({ actionTimeout: 20_000 });

test("właściciel: sprzęt wynajęty od przyjęcia na bazę, przez wydanie na budowę i koszty, po zwrot do wypożyczalni i cofnięcie", async ({ page }) => {
  test.setTimeout(300_000);
  await openFreshAccount(page, "sprzet wynajety");
  await skipTutorial(page);
  await addManager(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik" });
  await addSite(page, { name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", manager: "Adam Nowak" });

  // Na nowym koncie nie ma kategorii, więc formularz wynajmu nie ma czego wybrać.
  let body = await openOperation(page, "Sprzęt wynajęty");
  await expect(body.getByText("Firma nie ma jeszcze kategorii narzędzi.")).toBeVisible();
  await expect(body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" })).toHaveCount(0);

  // Najpierw kategorie, potem odświeżenie: po dodaniu narzędzia formularz gubi kategorie dodane bez odświeżenia
  // (osobny test niżej), a formularz wynajmu dostaje nowe kategorie dopiero z nową tablicą.
  body = await openOperation(page, "Dodaj narzędzie");
  await addCategory(body, "Młoty", "H");
  await addCategory(body, "Szlifierki", "S");
  await addCategory(body, "Maszyny", "M");
  await page.reload();
  body = await openOperation(page, "Dodaj narzędzie");
  await addTool(body, { category: "Młoty (H)", name: "Młot Hilti", value: "3200", code: "H-01" });
  await addTool(body, { category: "Szlifierki (S)", name: "Szlifierka kątowa", value: "450,50", code: "S-01" });
  await addTool(body, { category: "Szlifierki (S)", name: "Szlifierka mała", value: "380", code: "S-02" });

  body = await openOperation(page, "Sprzęt wynajęty");
  await expect(body.getByLabel("Wartość (zł, opcjonalnie)")).toBeVisible();
  const place = body.getByLabel("Gdzie stoi");
  await expect(place.locator("option")).toHaveText(["Wybierz miejsce", "Magazyn", "Rataje"]);
  await place.selectOption({ label: "Magazyn" });
  await body.getByLabel("Kategoria").selectOption({ label: "Maszyny" });
  await body.getByLabel("Nazwa", { exact: true }).fill("Minikoparka Kubota");
  await body.getByLabel("Wypożyczalnia").fill("Ramirent Poznań");
  const returnOn = warsawDay(3);
  await body.getByLabel("Termin zwrotu").fill(returnOn);
  await body.getByLabel("Wartość (zł, opcjonalnie)").fill("120 000");

  // Stawka musi być liczbą i mieć najwyżej dwa miejsca po przecinku; pola zostają wypełnione po błędzie.
  const rate = body.getByLabel("Stawka dobowa (zł)");
  await rate.fill("czterysta");
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("alert")).toHaveText("Wpisz liczbę, np. 3200 albo 3200,50.");
  await expect(body.getByLabel("Wypożyczalnia")).toHaveValue("Ramirent Poznań");
  await rate.fill("450,555");
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await rate.fill("450");
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("status")).toContainText("Przyjęto M-01 Minikoparka Kubota: Magazyn.");
  // Po zapisie pusty formularz pod następny wynajem; tablica z otwartym formularzem mieści się na telefonie.
  await expect(body.getByLabel("Wypożyczalnia")).toHaveValue("");
  await expectNoHorizontalScroll(page);

  const base = page.getByRole("region", { name: "Baza Magazyn" });
  const rentedAtBase = base.getByRole("link", { name: /M-01/ });
  await expect(rentedAtBase).toContainText("wynajęte");
  await expect(rentedAtBase).not.toContainText("po terminie zwrotu");
  await expect(rentedAtBase).toContainText(money("120 000,00"));
  // Termin zwrotu ma na tablicy własny dopisek, więc nie wchodzi do zbiorczego „Sprzęt z terminem…” (deadlines.ts).
  await expect(page.getByRole("heading", { name: /Sprzęt z terminem/ })).toHaveCount(0);

  await page.goto("/terminy");
  const deadlines = page.getByTestId("upcoming-deadlines");
  await expect(deadlines.getByRole("link")).toHaveCount(1);
  await expect(deadlines.getByRole("link")).toContainText(`Termin zwrotu: termin ${plDay(returnOn)} · na bazie Magazyn`);
  await expect(deadlines.getByRole("link")).toContainText("za 3 dni");

  // Wydanie checklistą: wynajęte rusza się jak własne.
  await page.goto("/");
  body = await openOperation(page, "Wydaj z bazy");
  for (const label of ["H-01 Młot Hilti", "S-01 Szlifierka kątowa", "M-01 Minikoparka Kubota"]) await body.getByRole("checkbox", { name: label }).check();
  await expect(body.getByRole("radio", { name: /Rataje/ })).toBeChecked();
  await body.getByRole("button", { name: "Zatwierdź ✓" }).click();
  await expect(body.getByRole("status").first()).toContainText(/Zapisano: .*M-01.* → Rataje/);
  const rataje = page.getByRole("region", { name: "Budowa Rataje" });
  await expect(rataje.getByRole("list").getByRole("link")).toHaveCount(3);
  await expect(rataje.getByRole("link", { name: /M-01/ })).toContainText("wynajęte");
  await expect(rataje.getByRole("link", { name: /M-01/ })).toContainText("0 dni");
  await expect(base.getByRole("link")).toHaveText([/^Magazyn$/, /S-02/]);

  // Karta: wypożyczalnia i stawka dobowa z umowy; przed pierwszą stawką firmy koszty jeszcze nie ruszyły.
  await rataje.getByRole("link", { name: /M-01/ }).click();
  await expect(page.getByRole("heading", { name: /M-01/ })).toBeVisible();
  const rental = page.getByTestId("tool-rental");
  await expect(rental).toContainText("Z wypożyczalni Ramirent Poznań.");
  await expect(rental).toContainText(/Stawka dobowa: 450,00\s*zł\./);
  await expect(detail(page, "Stawka dzienna")).toHaveText("brak: ustaw stawkę dzienną w ustawieniach");
  await expect(detail(page, "Stan")).toHaveText("W obiegu · Zaakceptowane");
  // Wynajęte wybrane ręcznie dostaje naklejkę jak każde narzędzie (ADR 0030).
  await expect(page.locator("summary", { hasText: "Naklejka QR" })).toBeVisible();
  // Termin zwrotu nie ma wykonania ani usuwania, tylko przedłużenie.
  const returnDeadline = page.getByTestId("deadline-zwrot");
  await expect(returnDeadline).toContainText(`Termin: ${plDay(returnOn)} (za 3 dni)`);
  await expect(returnDeadline.locator("summary", { hasText: "Przedłuż wynajem" })).toBeVisible();
  await expect(returnDeadline.locator("summary", { hasText: "Wpisz wykonanie" })).toHaveCount(0);
  await returnDeadline.locator("summary", { hasText: "Przedłuż wynajem" }).click();
  await expect(returnDeadline.getByRole("button", { name: "Usuń termin" })).toHaveCount(0);
  await expect(returnDeadline.getByLabel("Co ile miesięcy (opcjonalnie)")).toHaveCount(0);

  // Stawka firmy 1% z zakładki „Koszty” budowy: H-01 3200 zł → 32,00, S-01 450,50 zł → 4,505 → 4,51, M-01 450,00 z umowy.
  await page.goto("/");
  await page.getByRole("link", { name: "Rataje", exact: true }).click();
  await page.getByRole("navigation", { name: "Zakładki" }).getByRole("link", { name: "Koszty" }).click();
  await expect(page.getByRole("heading", { name: "Ustaw stawkę dzienną" })).toBeVisible();
  await expect(page.getByLabel("Stawka firmy (% wartości na dzień)")).toHaveValue("1");
  await page.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("486,51"));
  const costs = page.getByRole("list", { name: "Koszt sprzętu" });
  await expect(costs.getByRole("link")).toHaveCount(3);
  await expect(costs.getByRole("link", { name: /H-01/ })).toContainText(/1 dzień × 32,00\s*zł/);
  await expect(costs.getByRole("link", { name: /S-01/ })).toContainText(/1 dzień × 4,51\s*zł/);
  await expect(costs.getByRole("link", { name: /M-01/ })).toContainText(/1 dzień × 450,00\s*zł/);
  const today = plDay(warsawDay(0));
  await expect(page.getByText(`${today} – ${today}, 3 szt.`)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Pobierz Excel" }).click()]);
  const [sheet] = await readXlsxFile(await download.path());
  expect(sheet.data).toContainEqual(["M-01", "Minikoparka Kubota", 1, 450, 450]);
  expect(sheet.data).toContainEqual(["S-01", "Szlifierka kątowa", 1, 4.51, 4.51]);
  expect(sheet.data.at(-1)).toEqual(["Razem", null, null, null, 486.51]);

  await page.getByRole("navigation", { name: "Okres" }).getByRole("link", { name: "Poprzedni miesiąc" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("0,00"));
  await expect(page.getByText("W tym okresie nie było tu sprzętu.")).toBeVisible();
  await page.getByRole("navigation", { name: "Okres" }).getByRole("link", { name: "Ten miesiąc" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("486,51"));

  // Stawka wypożyczalni wygrywa z kwotą narzędzia: kwota 99 zł na karcie niczego nie zmienia.
  await costs.getByRole("link", { name: /M-01/ }).click();
  await expect(detail(page, "Stawka dzienna")).toHaveText(/^450,00\s*zł za dzień \(stawka wypożyczalni\)$/);
  await page.locator("summary", { hasText: "Stawka dzienna tego narzędzia" }).click();
  await page.getByLabel("Kwota za dzień (zł)").fill("99");
  await page.getByRole("button", { name: "Zapisz stawkę narzędzia" }).click();
  await expect(page.getByText("Zapisano.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(detail(page, "Stawka dzienna")).toHaveText(/^450,00\s*zł za dzień \(stawka wypożyczalni\)$/);

  // Zestawienie z menu.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Koszty sprzętu" }).click();
  await expect(page.getByRole("heading", { name: "Koszty sprzętu", level: 1 })).toBeVisible();
  await expect(page.getByTestId("cost-total")).toHaveText(zl("486,51"));
  await expect(page.getByRole("list", { name: "Budowy" }).getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Budowy" }).getByRole("link")).toContainText(/Rataje[\s\S]*3 szt\.[\s\S]*486,51\s*zł/);
  await expectNoHorizontalScroll(page);

  // Strona „Narzędzia”: własne i wynajęte razem, wynajęte z dopiskiem; filtry zawężają od razu.
  await page.goto("/narzedzia");
  const list = page.getByTestId("tools-list");
  await expect(list.getByRole("link")).toHaveText([/H-01/, /M-01/, /S-01/, /S-02/]);
  await expect(page.getByTestId("tools-count")).toHaveText(/^Narzędzia: 4 · wartość w obiegu 124\s030,50\s*zł$/);
  const excavator = list.getByRole("link", { name: /M-01/ });
  for (const text of ["wynajęte", "Maszyny", "Budowa", "Rataje", "odpowiada: Adam Nowak", "0 dni"]) await expect(excavator).toContainText(text);
  await expect(excavator).toContainText(money("120 000,00"));
  await expect(list.getByRole("link", { name: /H-01/ })).not.toContainText("wynajęte");
  const filters = page.getByRole("search", { name: "Filtry" });
  await expect(filters.getByLabel("Gdzie jest").locator("option")).toHaveText(["Wszystkie", "Baza: Magazyn", "Budowa: Rataje"]);
  await expect(filters.getByLabel("Kategoria").locator("option")).toHaveText(["Wszystkie", "Maszyny", "Młoty", "Szlifierki"]);
  await expect(filters.getByLabel("Pokaż też wycofane i zwrócone do wypożyczalni")).toHaveCount(0);
  await filters.getByLabel("Gdzie jest").selectOption({ label: "Budowa: Rataje" });
  await expect(list.getByRole("link")).toHaveText([/H-01/, /M-01/, /S-01/]);
  await filters.getByLabel("Kategoria").selectOption("Maszyny");
  await expect(list.getByRole("link")).toHaveText([/M-01/]);
  await expect(page.getByTestId("tools-count")).toHaveText(/^Narzędzia: 1 · wartość w obiegu 120\s000,00\s*zł$/);
  await filters.getByLabel("Kategoria").selectOption({ label: "Wszystkie" });
  await filters.getByLabel("Gdzie jest").selectOption({ label: "Wszystkie" });
  await filters.getByLabel("Szukaj").fill("kubota");
  await expect(list.getByRole("link")).toHaveText([/M-01/]);
  await filters.getByLabel("Szukaj").fill("m01");
  await expect(list.getByRole("link")).toHaveText([/M-01/]);
  await filters.getByLabel("Szukaj").fill("zzz");
  await expect(page.getByText("Nic nie pasuje do filtrów.")).toBeVisible();
  await filters.getByLabel("Szukaj").fill("");

  // Naklejki: wynajęte nie wchodzi do druku wszystkich nieoklejonych, ale można je zaznaczyć ręcznie.
  await page.goto("/naklejki");
  await expect(page.getByRole("button", { name: "Pobierz PDF: wszystkie nieoklejone (3 szt.)" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "M-01 Minikoparka Kubota" })).toBeVisible();
  await page.getByRole("checkbox", { name: "M-01 Minikoparka Kubota" }).check();
  await expect(page.getByRole("button", { name: "Pobierz PDF: zaznaczone (1 szt.)" })).toBeEnabled();

  // Zwrot do wypożyczalni z karty, z potwierdzeniem; „Anuluj” niczego nie zapisuje.
  await page.goto("/narzedzia");
  await excavator.click();
  await expect(page).toHaveURL(/\/narzedzia\/[0-9a-f-]{36}$/);
  const excavatorCard = page.url();
  await page.locator("summary", { hasText: "Zwrot do wypożyczalni" }).click();
  await page.getByRole("button", { name: "Zwrot do wypożyczalni" }).click();
  await expect(page.getByText("Zapisać zwrot M-01 do wypożyczalni?")).toBeVisible();
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(page.getByText("Zapisać zwrot M-01 do wypożyczalni?")).toHaveCount(0);
  await page.getByRole("button", { name: "Zwrot do wypożyczalni" }).click();
  await page.getByRole("button", { name: "Tak, zwrócony" }).click();
  await expect(rental).toContainText("Zwrócony do wypożyczalni. Zostaje w historii.");
  await expect(page.getByRole("region", { name: "Gdzie jest" })).toContainText("Zwrócone do wypożyczalni, ostatnio: Rataje");
  await expect(detail(page, "Stan")).toHaveText("Zwrócone do wypożyczalni · Zaakceptowane");
  await expect(page.locator("summary", { hasText: "Zwrot do wypożyczalni" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Naklejka QR" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Przedłuż wynajem" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Zgłoś uszkodzenie" })).toHaveCount(0);
  const history = page.locator("ol.history > li");
  await expect(history.first()).toContainText("Zwrot do wypożyczalni");
  await expect(history.first()).toContainText("W obiegu → Zwrócone do wypożyczalni");
  await expect(history).toHaveCount(3);
  await expectNoHorizontalScroll(page);

  // Po zwrocie: nie ma go na tablicy ani w terminach, a doba z dziś zostaje w kosztach budowy.
  await page.goto("/");
  await expect(rataje.getByRole("list").getByRole("link")).toHaveCount(2);
  await expect(rataje.getByRole("link", { name: /M-01/ })).toHaveCount(0);
  const lastMovement = page.getByRole("region", { name: "Ostatnie ruchy" }).getByRole("listitem").first();
  await expect(lastMovement).toContainText("Zwrot do wypożyczalni");
  await expect(lastMovement).toContainText("M-01");
  await page.goto("/terminy");
  await expect(page.getByText("W najbliższych 30 dniach nie ma żadnych terminów.")).toBeVisible();
  await page.goto("/koszty");
  await expect(page.getByTestId("cost-total")).toHaveText(zl("486,51"));

  // Na liście „Narzędzia” zwrócone jest tylko na życzenie i nie wchodzi do wartości w obiegu.
  await page.goto("/narzedzia");
  await expect(list.getByRole("link")).toHaveText([/H-01/, /S-01/, /S-02/]);
  await expect(page.getByTestId("tools-count")).toHaveText(/^Narzędzia: 3 · wartość w obiegu 4030,50\s*zł$/);
  await filters.getByLabel("Pokaż też wycofane i zwrócone do wypożyczalni").check();
  await expect(list.getByRole("link")).toHaveText([/H-01/, /M-01/, /S-01/, /S-02/]);
  await expect(list.getByRole("link", { name: /M-01/ })).toContainText("Zwrócone do wypożyczalni, ostatnio: Rataje");
  await expect(list.getByRole("link", { name: /M-01/ })).toContainText("od 0 dni");
  await expect(page.getByTestId("tools-count")).toHaveText(/^Narzędzia: 4 · wartość w obiegu 4030,50\s*zł$/);
  await expect(filters.getByLabel("Gdzie jest").locator("option")).toHaveText(["Wszystkie", "Baza: Magazyn", "Budowa: Rataje"]);

  // Pomyłka: autor cofa zwrot w 15 minut i sprzęt wraca na budowę, z terminem zwrotu.
  await page.goto("/");
  await lastMovement.getByRole("button", { name: "Cofnij" }).click();
  await expect(rataje.getByRole("link", { name: /M-01/ })).toContainText("wynajęte");
  await expect(page.getByRole("region", { name: "Ostatnie ruchy" }).getByRole("listitem").first()).toContainText("Cofnięcie");
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/M-01/]);
  await page.goto(excavatorCard);
  await expect(detail(page, "Stan")).toHaveText("W obiegu · Zaakceptowane");
  await expect(page.getByRole("region", { name: "Gdzie jest" })).toContainText("Rataje, od 0 dni");
  await expect(history.filter({ hasText: "Zwrot do wypożyczalni" })).toContainText("cofnięty");
  await expect(page.locator("summary", { hasText: "Zwrot do wypożyczalni" })).toBeVisible();
  await page.goto("/koszty");
  await expect(page.getByTestId("cost-total")).toHaveText(zl("486,51"));
});

test("kierownik przyjmuje wynajęte na swoją budowę po terminie zwrotu, przedłuża i oddaje; koszty widzi dopiero za zgodą właściciela", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const account = await openFreshAccount(page, "wynajem kierownik");
  await skipTutorial(page);
  const nowak = await addManager(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik" });
  await addSite(page, { name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", manager: "Adam Nowak" });
  await addSite(page, { name: "Winogrady", address: "os. Wichrowe 3, Poznań", manager: "Jan Testowy (właściciel)" });
  let body = await openOperation(page, "Dodaj narzędzie");
  await addCategory(body, "Maszyny", "M");
  await page.reload();
  body = await openOperation(page, "Dodaj narzędzie");
  await addTool(body, { category: "Maszyny (M)", name: "Zagęszczarka", value: "8000", code: "M-01" });
  await page.goto("/ustawienia");
  const rates = page.getByRole("region", { name: "Stawki dzienne" });
  await rates.getByLabel("Stawka firmy (% wartości na dzień)").fill("1");
  await rates.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(rates.getByRole("status")).toHaveText("Zapisano.");

  // Właściciel przyjmuje nagrzewnicę na bazę, a zagęszczarkę wydaje na swoją budowę Winogrady.
  await page.goto("/");
  body = await openOperation(page, "Sprzęt wynajęty");
  await body.getByLabel("Gdzie stoi").selectOption({ label: "Magazyn" });
  await body.getByLabel("Kategoria").selectOption({ label: "Maszyny" });
  await body.getByLabel("Nazwa", { exact: true }).fill("Nagrzewnica");
  await body.getByLabel("Wypożyczalnia").fill("Ramirent");
  await body.getByLabel("Stawka dobowa (zł)").fill("40");
  await body.getByLabel("Termin zwrotu").fill(warsawDay(20));
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("status")).toContainText("Przyjęto M-02 Nagrzewnica: Magazyn.");
  body = await openOperation(page, "Wydaj z bazy");
  await body.getByRole("checkbox", { name: "M-01 Zagęszczarka" }).check();
  await body.getByRole("radio", { name: /Winogrady/ }).check();
  await body.getByRole("button", { name: "Zatwierdź ✓" }).click();
  await expect(body.getByRole("status").first()).toContainText("Zapisano: M-01 → Winogrady");

  // Kierownik: pierwsze logowanie hasłem tymczasowym, wynajem tylko na swojej budowie i bez wartości.
  const manager = await secondPhone(browser, testInfo);
  await firstSignIn(manager, nowak.email, nowak.temporaryPassword, account.companyName);
  await skipTutorial(manager);
  body = await openOperation(manager, "Sprzęt wynajęty");
  await expect(body.getByLabel("Wartość (zł, opcjonalnie)")).toHaveCount(0);
  await expect(body.getByLabel("Gdzie stoi").locator("option")).toHaveText(["Wybierz miejsce", "Rataje"]);
  await expect(body.getByLabel("Gdzie stoi")).not.toHaveValue("");
  await body.getByLabel("Kategoria").selectOption({ label: "Maszyny" });
  await body.getByLabel("Nazwa", { exact: true }).fill("Agregat prądotwórczy");
  await body.getByLabel("Wypożyczalnia").fill("Wynajem Kowalski");
  await body.getByLabel("Stawka dobowa (zł)").fill("300,50");
  // Umowa skończyła się wczoraj: sprzęt przyjęty z terminem w przeszłości jest od razu po terminie zwrotu.
  const yesterday = warsawDay(-1);
  await body.getByLabel("Termin zwrotu").fill(yesterday);
  await body.getByRole("button", { name: "Przyjmij sprzęt wynajęty" }).click();
  await expect(body.getByRole("status")).toContainText("Przyjęto M-03 Agregat prądotwórczy: Rataje.");

  const rataje = manager.getByRole("region", { name: "Budowa Rataje" });
  const generator = rataje.getByRole("link", { name: /M-03/ });
  await expect(generator).toContainText("wynajęte");
  await expect(generator).toContainText("po terminie zwrotu");
  await expect(manager.getByRole("region", { name: "Gdzie jest co" })).not.toContainText("zł");

  await manager.goto("/terminy");
  const overdue = manager.getByTestId("upcoming-deadlines").getByRole("link", { name: /M-03/ });
  await expect(overdue).toContainText(`Termin zwrotu: po terminie (${plDay(yesterday)}) · na budowie Rataje · kierownik: Adam Nowak`);
  await expect(overdue).toContainText("1 dzień temu");
  await expect(overdue).toHaveClass(/tool-row-alarm/);

  // Właściciel dostaje wpis w dzwonku o przyjęciu przez kierownika.
  await page.goto("/dzwonek");
  await expect(page.getByText("Sprzęt wynajęty: M-03 Agregat prądotwórczy")).toBeVisible();
  await expect(page.getByText(`Adam Nowak, na budowie Rataje. Wypożyczalnia Wynajem Kowalski, zwrot do ${plDay(yesterday)}.`)).toBeVisible();

  // Karta u kierownika bez zgody: wypożyczalnia tak, stawka nie; zakładki „Koszty” i zestawienia nie ma.
  await overdue.click();
  await expect(manager.getByRole("heading", { name: /M-03/ })).toBeVisible();
  await expect(manager.getByTestId("tool-rental")).toContainText("Z wypożyczalni Wynajem Kowalski.");
  await expect(manager.getByTestId("tool-rental")).not.toContainText("Stawka dobowa");
  await expect(manager.locator("main")).not.toContainText("zł");
  await expect(manager.locator("summary", { hasText: "Stawka dzienna tego narzędzia" })).toHaveCount(0);
  const generatorCard = manager.url();

  // Przedłużenie wynajmu o tydzień zdejmuje „po terminie”.
  const returnDeadline = manager.getByTestId("deadline-zwrot");
  await expect(returnDeadline).toContainText(`Termin: ${plDay(yesterday)} (1 dzień temu)`);
  await expect(returnDeadline).toContainText("po terminie");
  await returnDeadline.locator("summary", { hasText: "Przedłuż wynajem" }).click();
  const extended = warsawDay(7);
  await returnDeadline.getByLabel("Termin zwrotu").fill(extended);
  await returnDeadline.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(manager.getByTestId("deadline-zwrot")).toContainText(`Termin: ${plDay(extended)} (za 7 dni)`);
  await expect(manager.getByTestId("deadline-zwrot")).not.toContainText("po terminie");
  await manager.goto("/");
  await expect(generator).toContainText("wynajęte");
  await expect(generator).not.toContainText("po terminie zwrotu");

  await manager.getByRole("link", { name: "Rataje", exact: true }).click();
  await expect(manager).toHaveURL(/\/budowy\/[0-9a-f-]{36}$/);
  await expect(manager.getByRole("heading", { name: /Rataje/, level: 1 })).toBeVisible();
  await expect(manager.getByRole("link", { name: "Koszty", exact: true })).toHaveCount(0);
  await manager.goto(`${new URL(manager.url()).pathname}/koszty`);
  await expect(manager).toHaveURL(/\/budowy\/[0-9a-f-]{36}$/);
  await manager.goto("/koszty");
  await expect(manager).toHaveURL(/\/$/);
  await manager.getByRole("button", { name: "Menu" }).click();
  await expect(manager.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Koszty sprzętu" })).toHaveCount(0);
  await manager.getByRole("button", { name: "Menu" }).click();

  // Nagrzewnicy z bazy kierownik nie oddaje ani nie przedłuża: to nie jego lokalizacja.
  await manager.goto("/narzedzia");
  await manager.getByTestId("tools-list").getByRole("link", { name: /M-02/ }).click();
  await expect(manager.getByTestId("tool-rental")).toContainText("Z wypożyczalni Ramirent.");
  await expect(manager.locator("summary", { hasText: "Zwrot do wypożyczalni" })).toHaveCount(0);
  await expect(manager.locator("summary", { hasText: "Przedłuż wynajem" })).toHaveCount(0);

  // Owner widzi koszt agregatu ze stawki wypożyczalni od razu; zgoda dla kierownika jest domyślnie wyłączona.
  await page.goto("/koszty");
  await expect(page.getByRole("list", { name: "Budowy" }).getByRole("link")).toHaveText([/Rataje[\s\S]*300,50\s*zł/, /Winogrady[\s\S]*80,00\s*zł/]);
  await expect(page.getByTestId("cost-total")).toHaveText(zl("380,50"));
  await page.goto("/ustawienia");
  const visibility = page.getByRole("region", { name: "Kto widzi koszty" });
  const consent = visibility.getByLabel("Kierownik widzi koszty swoich budów i pojazdów");
  await expect(consent).not.toBeChecked();
  await consent.check();
  await visibility.getByRole("button", { name: "Zapisz" }).click();
  await expect(visibility.getByRole("status")).toHaveText("Zapisano.");

  // Ze zgodą kierownik widzi koszty tylko swojej budowy i stawkę wypożyczalni na karcie, ale dalej nie wartości.
  await manager.goto(generatorCard);
  await expect(manager.getByTestId("tool-rental")).toContainText(/Stawka dobowa: 300,50\s*zł\./);
  await expect(manager.locator("summary", { hasText: "Stawka dzienna tego narzędzia" })).toHaveCount(0);
  await manager.goto("/koszty");
  await expect(manager.getByRole("heading", { name: "Koszty sprzętu", level: 1 })).toBeVisible();
  await expect(manager.getByText("Koszt sprzętu Twoich budów i pojazdów w wybranym okresie.", { exact: false })).toBeVisible();
  await expect(manager.getByRole("list", { name: "Budowy" }).getByRole("link")).toHaveText([/Rataje[\s\S]*1 szt\.[\s\S]*300,50\s*zł/]);
  await expect(manager.getByTestId("cost-total")).toHaveText(zl("300,50"));
  await manager.getByRole("list", { name: "Budowy" }).getByRole("link").click();
  await expect(manager.getByRole("navigation", { name: "Zakładki" }).getByRole("link", { name: "Koszty" })).toHaveAttribute("aria-current", "page");
  await expect(manager.getByRole("list", { name: "Koszt sprzętu" }).getByRole("link")).toHaveText([/M-03[\s\S]*1 dzień × 300,50\s*zł/]);
  await expectNoHorizontalScroll(manager);
  await manager.goto("/narzedzia");
  await expect(manager.getByTestId("tools-list").getByRole("link")).toHaveCount(3);
  await expect(manager.locator("main")).not.toContainText("zł");

  // Kierownik oddaje agregat do wypożyczalni: znika z jego tablicy, a doba zostaje w kosztach.
  await manager.goto(generatorCard);
  await manager.locator("summary", { hasText: "Zwrot do wypożyczalni" }).click();
  await manager.getByRole("button", { name: "Zwrot do wypożyczalni" }).click();
  await manager.getByRole("button", { name: "Tak, zwrócony" }).click();
  await expect(manager.getByTestId("tool-rental")).toContainText("Zwrócony do wypożyczalni. Zostaje w historii.");
  await manager.goto("/");
  await expect(rataje.getByRole("link", { name: /M-03/ })).toHaveCount(0);
  await expect(rataje.getByText("Na tej budowie nie ma jeszcze narzędzi.")).toBeVisible();
  await manager.goto("/koszty");
  await expect(manager.getByTestId("cost-total")).toHaveText(zl("300,50"));
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/M-02/]);
  await manager.context().close();
});

/** Wartość z listy „Dane” na karcie narzędzia. */
function detail(page: Page, label: string): Locator {
  return page.locator("dl.details > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
}

test("formularz „Dodaj narzędzie” nie gubi kategorii dodanej przed chwilą: drugie narzędzie tej kategorii bez odświeżania strony", async ({ page }) => {
  test.setTimeout(120_000);
  await openFreshAccount(page, "kategorie");
  await skipTutorial(page);
  const body = await openOperation(page, "Dodaj narzędzie");
  await addCategory(body, "Młoty", "H");
  await addTool(body, { category: "Młoty (H)", name: "Młot Hilti", value: "3200", code: "H-01" });
  // Właściciel dodaje kolejny młot: kategoria „Młoty” jest już w firmie, więc musi być na liście.
  await expect(body.getByText("Firma nie ma jeszcze kategorii narzędzi.")).toHaveCount(0);
  await expect(body.getByLabel("Kategoria", { exact: true }).locator("option")).toHaveText(["Wybierz kategorię", "Młoty (H)"]);
  await addCategory(body, "Szlifierki", "S");
  await addTool(body, { category: "Szlifierki (S)", name: "Szlifierka kątowa", code: "S-01" });
  await expect(body.getByLabel("Kategoria", { exact: true }).locator("option")).toHaveText(["Wybierz kategorię", "Młoty (H)", "Szlifierki (S)"]);
});
