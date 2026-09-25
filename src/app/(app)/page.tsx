import type { Metadata } from "next";
import Link from "next/link";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTools } from "@/registry/registry";

export const metadata: Metadata = { title: t("board.title") };

export default async function BoardPage() {
  const session = await requireSession();
  const { base } = await getRegistry().as(session.userId).whereIsWhat();

  return (
    <>
      <div className="page-head">
        <h1 className="display page-title">{t("board.title")}</h1>
        {canManageTools(session) && (
          <Link className="button" href="/narzedzia/nowe">
            {t("board.addTool")}
          </Link>
        )}
      </div>
      <section className="location" aria-labelledby="location-base">
        <div className="location-head">
          <h2 id="location-base" className="display location-name">
            <span className="plate">{t("board.baseKind")}</span>
            {base.name}
          </h2>
          <span className="location-count">{t("board.toolCount", { count: base.tools.length })}</span>
        </div>
        {base.tools.length === 0 ? (
          <p className="empty">{t("board.baseEmpty")}</p>
        ) : (
          <ul className="tool-list">
            {base.tools.map((tool) => (
              <li key={tool.id}>
                <Link href={`/narzedzia/${tool.id}`} className="tool-row">
                  <span className="plate">{tool.code}</span>
                  <span className="tool-row-name">{tool.name}</span>
                  <span className="tool-row-days">{formatDays(tool.daysInPlace)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
