import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { parseToolListFilters, toolListSearch } from "@/lib/tool-list-filters";
import { getRegistry } from "@/lib/registry-instance";
import { canImportTools, canSeeValues } from "@/registry/registry";
import { ToolBrowser } from "./tool-browser";

export const generateMetadata = (): Metadata => ({ title: t("toolsPage.title") });

/**
 * Cały sprzęt firmy dla każdej roli: gdzie jest, od ilu dni i kto odpowiada, z filtrami kategorii, lokalizacji
 * i przyciskami „tylko zaginione, w serwisie, z alarmem”, zapisanymi w adresie. Zaginione są na liście, wycofane i zwrócone na życzenie.
 * Wartości w zł tylko dla właściciela, jak na tablicy.
 */
export default async function ToolsPage(props: PageProps<"/narzedzia">) {
  const session = await requireSession();
  const filters = parseToolListFilters(await props.searchParams);
  const tools = await getRegistry().as(session.userId).toolList();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("toolsPage.back")}
        </Link>
      </p>
      <div className="page-head">
        <h1 className="display page-title">{t("toolsPage.title")}</h1>
        {canImportTools(session) && (
          <Link href="/narzedzia/import" className="button button-quiet button-small">
            {t("toolsPage.import")}
          </Link>
        )}
      </div>
      <p className="muted">{t("toolsPage.intro")}</p>
      {tools.length === 0 ? <p className="empty">{t("toolsPage.empty")}</p> : (
        // Klucz z filtrów: link z innymi filtrami, kliknięty na tej samej stronie, zaczyna od nich, a nie od poprzednich.
        <ToolBrowser key={toolListSearch(filters)} tools={tools} initialFilters={filters} withValues={canSeeValues(session)} />
      )}
    </>
  );
}
