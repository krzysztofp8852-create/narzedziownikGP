import { expect, test } from "@playwright/test";

test("niezalogowany pod adresem głównym widzi stronę o programie z cennikiem, kontaktem i wejściem do demo", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cała budowa w telefonie: sprzęt, ludzie, godziny, koszty i pojazdy");

  // Strona o programie trafia do wyszukiwarki i ma podgląd linku, a strony aplikacji nie.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\.png$/);

  // Ewidencja sprzętu to jeden z modułów; skrót pod hasłem prowadzi do opisu modułu.
  await page.getByRole("list", { name: "Moduły programu" }).getByRole("link", { name: "Odbijanie i czas na budowie" }).click();
  await expect(page).toHaveURL(/#modul-time$/);
  await expect(page.getByRole("heading", { name: "Plakat budowy z kodem QR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Czat z supportem w aplikacji" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pomoc zawsze pod ręką" })).toBeVisible();

  await page.getByRole("link", { name: "Cennik" }).first().click();
  const pricing = page.getByRole("region", { name: "Cennik" });
  // Trzy pakiety: wdrożenie, opłata za rok, osoby decyzyjne (z właścicielem) i narzędzia; mały wyróżniony jako najpopularniejszy.
  const small = pricing.getByRole("listitem", { name: "Mały" });
  await expect(small).toContainText("Najpopularniejszy wśród małych firm");
  await expect(small).toContainText("3 000 zł brutto, jednorazowo");
  await expect(small).toContainText("400 zł brutto za rok");
  await expect(small).toContainText("do 5 osób decyzyjnych");
  await expect(small).toContainText("łącznie z właścicielem");
  await expect(small).toContainText("do 150 narzędzi");
  await expect(small).toContainText("wszystkie moduły w cenie");
  const medium = pricing.getByRole("listitem", { name: "Średni" });
  await expect(medium).toContainText("6 000 zł brutto, jednorazowo");
  await expect(medium).toContainText("800 zł brutto za rok");
  await expect(medium).toContainText("do 30 osób decyzyjnych");
  await expect(medium).toContainText("do 500 narzędzi");
  await expect(medium).not.toContainText("Najpopularniejszy");
  const large = pricing.getByRole("listitem", { name: "Duży" });
  await expect(large).toContainText("12 000 zł brutto, jednorazowo");
  await expect(large).toContainText("2 000 zł brutto za rok");
  await expect(large).toContainText("ponad 30 osób decyzyjnych");
  await expect(large).toContainText("bez limitu narzędzi");
  await expect(pricing).toContainText("Ceny są brutto: korzystamy ze zwolnienia podmiotowego z VAT (art. 113 ustawy o VAT)");
  await expect(pricing).toContainText("Konta pracowników się nie liczą");
  await expect(pricing).toContainText("na miejscu w Twojej firmie albo zdalnie");

  // Pytania, które wpisuje się w wyszukiwarkę; cena w odpowiedzi z tego samego cennika.
  await page.getByRole("link", { name: "Pytania" }).click();
  const faq = page.getByRole("region", { name: "Pytania i odpowiedzi" });
  await expect(faq.getByRole("term")).toHaveCount(14);
  await expect(faq).toContainText("mieści do 5 osób decyzyjnych i 150 narzędzi");
  await expect(faq).toContainText("3 000 zł brutto za wdrożenie ze szkoleniem i 400 zł brutto za rok");

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
