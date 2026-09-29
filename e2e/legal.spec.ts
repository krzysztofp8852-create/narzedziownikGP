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
