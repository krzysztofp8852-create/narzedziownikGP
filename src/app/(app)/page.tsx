import type { Metadata } from "next";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

export const metadata: Metadata = { title: t("board.title") };

export default async function BoardPage() {
  const session = await requireSession();
  const { base } = await getRegistry().as(session.userId).whereIsWhat();

  return (
    <>
      <h1 className="display page-title">{t("board.title")}</h1>
      <section className="location" aria-labelledby="location-base">
        <div className="location-head">
          <h2 id="location-base" className="display location-name">
            <span className="plate">{t("board.baseKind")}</span>
            {base.name}
          </h2>
          <span className="location-count">{t("board.toolCount", { count: base.tools.length })}</span>
        </div>
        {base.tools.length === 0 && <p className="empty">{t("board.baseEmpty")}</p>}
      </section>
    </>
  );
}
