import { expect, test } from "@playwright/test";

test("z logowania bez konta otwiera się regulamin, polityka prywatności i umowa powierzenia", async ({ page }) => {
  await page.goto("/logowanie");
  const legal = page.getByRole("navigation", { name: "Dokumenty prawne" });

  await legal.getByRole("link", { name: "Regulamin" }).click();
  await expect(page).toHaveURL(/\/regulamin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Regulamin usługi NarzędziownikGP");
  await expect(page.getByRole("note")).toContainText("Projekt dokumentu");

  await page.getByRole("navigation", { name: "Dokumenty prawne" }).getByRole("link", { name: "Polityka prywatności" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Polityka prywatności NarzędziownikGP");
  await expect(page.getByRole("article")).toContainText("Nagranie usuwamy zaraz po zamianie na tekst");

  // Odnośnik do załącznika prowadzi prosto do listy podprocesorów.
  await page.getByRole("link", { name: "załączniku 3 do umowy powierzenia" }).click();
  await expect(page).toHaveURL(/\/umowa-powierzenia#zalacznik-3-podprocesorzy$/);
  await expect(page.getByRole("heading", { name: "Załącznik 3. Podprocesorzy" })).toBeInViewport();
});

test("strona „Usuń konto” otwiera się bez logowania i mówi, do kogo pisać, w jakim terminie i co zostaje w historii", async ({ page }) => {
  await page.goto("/logowanie");
  await page.getByRole("navigation", { name: "Dokumenty prawne" }).getByRole("link", { name: "Usuń konto" }).click();

  await expect(page).toHaveURL(/\/usun-konto$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Usuń konto i dane");
  const article = page.getByRole("article");
  await expect(article.getByRole("link", { name: "kontakt@gp-engineering.pl" })).toHaveAttribute("href", "mailto:kontakt@gp-engineering.pl");
  await expect(article).toContainText("właściciela swojej firmy");
  await expect(article).toContainText("w ciągu 30 dni");
  await expect(article).toContainText("„Osoba zanonimizowana 3”");
  await expect(article.getByRole("heading", { name: "5. Co zostaje w historii" })).toBeVisible();
  // To nie projekt umowy i nie formularz: prośbę wysyła się e-mailem albo przekazuje właścicielowi.
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.locator("main form")).toHaveCount(0);
});
