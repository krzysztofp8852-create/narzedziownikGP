import { expect, type Locator, type Page, test } from "@playwright/test";
import { appNav } from "./support/navigation";

/** Strona /demo; bez demo w bazie test się pomija. */
async function openDemo(page: Page) {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kim chcesz być?");
  test.skip(await page.getByRole("button", { name: "Wejdź jako właściciel" }).isDisabled(), "W tej bazie nie założono demo (npm run demo:create)");
}

/** Dymek przewodnika stoi przy elemencie: pierścień podświetlenia otacza jego środek. */
async function expectRinged(page: Page, element: Locator) {
  await expect
    .poll(async () => {
      const box = await element.boundingBox();
      const ring = await page.locator(".demo-tour-ring").boundingBox();
      if (!box || !ring) return false;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      return center.x > ring.x && center.x < ring.x + ring.width && center.y > ring.y && center.y < ring.y + ring.height;
    })
    .toBe(true);
}

test("pierwszy ekran demo to cztery karty ról, każda z jednym zdaniem i wejściem bez logowania", async ({ page }) => {
  await openDemo(page);
  const cards = page.locator(".demo-role");
  await expect(cards.getByRole("heading", { level: 2 })).toHaveText(["Właściciel", "Kierownik", "Magazynier", "Pracownik"]);
  await expect(cards.getByRole("button")).toHaveText(["Wejdź jako właściciel", "Wejdź jako kierownik", "Wejdź jako magazynier", "Wejdź jako pracownik"]);
  for (const card of await cards.all()) await expect(card.locator(".demo-role-summary")).toHaveText(/^Zobaczysz [^.]+\.$/);
});

test("właściciel: przewodnik wydaj, zobacz, u kogo jest, przyjmij zwrot; pominięty wraca z paska demo od tego samego kroku", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Wejdź jako właściciel" }).click();
  await expect(page.getByTestId("company-name")).toBeVisible();

  const tour = page.getByTestId("demo-tour");
  await expect(tour).toContainText("Krok 1 z 4");
  await expect(tour.getByRole("heading")).toHaveText("Wydaj narzędzie na budowę");
  await expectRinged(page, page.getByRole("button", { name: "Wydaj z bazy" }));

  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Zobacz, u kogo jest");
  await expectRinged(page, page.getByRole("heading", { name: "Gdzie jest sprzęt" }));

  // Pominięty nie włącza się sam, także po przeładowaniu.
  await tour.getByRole("button", { name: "Pomiń przewodnik" }).click();
  await expect(tour).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("company-name")).toBeVisible();
  await expect(tour).toBeHidden();

  // „Przewodnik” na pasku demo wznawia go od kroku, na którym go pominięto.
  await page.getByTestId("demo-bar").getByRole("link", { name: "Przewodnik" }).click();
  await expect(tour).toContainText("Krok 2 z 4");
  await expect(tour.getByRole("heading")).toHaveText("Zobacz, u kogo jest");

  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Przyjmij zwrot");
  await expectRinged(page, page.getByRole("button", { name: "Zwróć na bazę" }));

  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Gotowe");
  await expect(tour.getByTestId("demo-tour-offer")).toBeVisible();
  await expectRinged(page, page.getByTestId("demo-bar").getByRole("group", { name: "Zobacz jako:" }));
  await tour.getByRole("button", { name: "Zakończ" }).click();
  await expect(tour).toBeHidden();

  // Przełącznik roli na pasku demo: ta sama firma oczami pracownika, z kilkoma pozycjami w nawigacji.
  await page.getByTestId("demo-bar").getByRole("button", { name: "Pracownik" }).click();
  await expect(appNav(page).getByRole("link", { name: "Zgłoś" })).toBeVisible();
  await expect(page.getByTestId("demo-bar").getByRole("button", { name: "Pracownik" })).toHaveAttribute("aria-current", "true");
});

test("pracownik: przewodnik odbij się w Skanuj z kodem plakatu z demo i zgłoś usterkę, a potem „Chcę to u siebie”", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Wejdź jako pracownik" }).click();
  await expect(page.getByTestId("company-name")).toBeVisible();

  const tour = page.getByTestId("demo-tour");
  await expect(tour).toContainText("Krok 1 z 3");
  await expect(tour.getByRole("heading")).toHaveText("Odbij się na budowie");
  // W demo nie ma plakatu do zeskanowania, więc dymek podaje kod plakatu budowy pracownika.
  await expect(tour).toContainText(/wpisz kod [0-9A-Z]{5}-[0-9A-Z]{5}/);
  const scan = appNav(page).getByRole("link", { name: "Skanuj" });
  await expectRinged(page, scan);
  // Na telefonie Skanuj jest w dolnym pasku, więc dymek stoi nad nim, żeby go nie zasłonić.
  await expect
    .poll(async () => {
      const [card, button] = [await tour.boundingBox(), await scan.boundingBox()];
      return !!card && !!button && card.y + card.height < button.y;
    })
    .toBe(true);

  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Zgłoś usterkę");
  await expectRinged(page, appNav(page).getByRole("link", { name: "Zgłoś" }));

  await tour.getByRole("button", { name: "Dalej" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Gotowe");
  await tour.getByTestId("demo-tour-offer").click();
  await expect(page).toHaveURL(/\/oferta$/);
  await expect(tour).toBeHidden();

  // Skończony przewodnik nie wraca sam po powrocie na tablicę.
  await page.goto("/");
  await expect(page.getByTestId("company-name")).toBeVisible();
  await expect(tour).toBeHidden();
  // „Chcę to u siebie” na pasku demo prowadzi do ceny.
  await page.getByTestId("demo-bar").getByTestId("demo-bar-offer").click();
  await expect(page).toHaveURL(/\/oferta$/);
});
