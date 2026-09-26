import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canImportTools } from "@/registry/registry";
import { ToolImport } from "./tool-import";

export const metadata: Metadata = { title: t("import.title") };

/** Import listy narzędzi z pliku: podgląd z błędami, potem zapis wszystko albo nic. Tylko właściciel. */
export default async function ImportPage() {
  const session = await requireSession();
  if (!canImportTools(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [categories, locations] = await Promise.all([registry.categories(), registry.locations()]);
  const places = [
    locations.base.name,
    ...locations.sites.filter((site) => site.status === "aktywna").map((site) => site.name),
    ...locations.services.map((service) => service.name),
  ];

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("import.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("import.title")}</h1>
      <div className="import">
        <section className="company-card import-rules">
          <p>{t("import.intro")}</p>
          <p>{t("import.rules")}</p>
          {categories.length === 0 ? (
            <p className="empty">{t("import.noCategories")}</p>
          ) : (
            <p>
              <strong>{t("import.categories")}:</strong>{" "}
              {categories.map((category) => t("tools.categoryOption", { name: category.name, prefix: category.prefix })).join(", ")}
            </p>
          )}
          <p>
            <strong>{t("import.locations")}:</strong> {places.join(", ")}
          </p>
        </section>
        <ToolImport operationId={randomUUID()} />
      </div>
    </>
  );
}
