import Link from "next/link";
import { t } from "@/i18n/t";
import type { ToDoItem } from "@/registry/registry";
import { ToDoList } from "./dzwonek/to-do-list";

/** Ile spraw z „Do zrobienia” stoi na tablicy; reszta jest pod „Zobacz wszystkie”. */
const BOARD_TO_DO_LIMIT = 5;

/** „Wymaga uwagi” na tablicy: najpilniejsze sprawy z „Do zrobienia” i odnośnik do całej skrzynki pod dzwonkiem. */
export function NeedsAttention({ items }: { items: ToDoItem[] }) {
  return (
    <section className="board-section" aria-labelledby="needs-attention">
      <div className="section-head">
        <h2 id="needs-attention" className="display section-title">
          {t("inbox.title")}
        </h2>
        {items.length > 0 && <Link href="/dzwonek">{t("inbox.seeAll", { count: items.length })}</Link>}
      </div>
      <ToDoList items={items.slice(0, BOARD_TO_DO_LIMIT)} />
    </section>
  );
}
