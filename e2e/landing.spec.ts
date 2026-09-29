import { expect, test } from "@playwright/test";

test("niezalogowany pod adresem głównym widzi stronę o programie z cennikiem, kontaktem i wejściem do demo", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wiesz, gdzie jest każde narzędzie, a system sam mówi, co leży za długo poza bazą");

  // Strona o programie trafia do wyszukiwarki i ma podgląd linku, a strony aplikacji nie.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\.png$/);

  await expect(page.getByRole("heading", { name: "Czat z supportem w aplikacji" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pomoc zawsze pod ręką" })).toBeVisible();

  await page.getByRole("link", { name: "Cennik" }).first().click();
  const pricing = page.getByRole("region", { name: "Cennik" });
  await expect(pricing.getByRole("listitem", { name: "Mały" })).toContainText("do 150 narzędzi");
  await expect(pricing.getByRole("listitem", { name: "Mały" })).toContainText("300 zł netto za rok");
  await expect(pricing.getByRole("listitem", { name: "Duży" })).toContainText("1 000 zł netto za rok");
  await expect(pricing.getByRole("listitem", { name: "Indywidualny" })).toContainText("ponad 1000 narzędzi");
  await expect(pricing).toContainText("5 000 zł netto, jednorazowo");
  await expect(pricing).toContainText("na miejscu w Twojej firmie albo zdalnie");

  // Pytania, które wpisuje się w wyszukiwarkę; cena w odpowiedzi z tego samego cennika.
  await page.getByRole("link", { name: "Pytania" }).click();
  const faq = page.getByRole("region", { name: "Pytania i odpowiedzi" });
  await expect(faq.getByRole("term")).toHaveCount(10);
  await expect(faq).toContainText("do 150 narzędzi kosztuje 300 zł netto za rok");
  await expect(faq).toContainText("wdrożenie ze szkoleniem za 5 000 zł netto");

  const contact = page.getByRole("region", { name: "Porozmawiajmy" });
  await expect(contact.getByRole("link", { name: "576 763 536" })).toHaveAttribute("href", "tel:+48576763536");
  await expect(contact.getByRole("link", { name: "kontakt@gp-engineering.pl" })).toHaveAttribute("href", "mailto:kontakt@gp-engineering.pl");

  await page.getByRole("link", { name: "Zobacz demo" }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  await page.goto("/");
  await page.getByRole("link", { name: "Zaloguj się" }).first().click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
