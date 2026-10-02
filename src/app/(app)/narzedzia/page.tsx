import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canImportTools, canSeeValues } from "@/registry/registry";
import { ToolBrowser } from "./tool-browser";

export const metadata: Metadata = { title: t("toolsPage.title") };

/**
 * Cały sprzęt firmy dla każdej roli: gdzie jest, od ilu dni i kto odpowiada, z filtrami kategorii i miejsca. Zaginione
 * są na liście, wycofane i zwrócone na życzenie. Wartości w zł tylko dla właściciela, jak na tablicy.
 */
export default async function ToolsPage() {
  const session = await requireSession();
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
      {tools.length === 0 ? <p className="empty">{t("toolsPage.empty")}</p> : <ToolBrowser tools={tools} withValues={canSeeValues(session)} />}
    </>
  );
}
