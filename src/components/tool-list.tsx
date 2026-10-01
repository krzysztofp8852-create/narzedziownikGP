import Link from "next/link";
import { DamagedIcon } from "@/components/damaged-icon";
import { MissingIcon } from "@/components/missing-icon";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { deadlineKindName } from "@/lib/deadline-text";
import type { ToolOnBoard } from "@/registry/registry";

/** Kwota w zł, gdy aktor ją widzi (klucz jest tylko u właściciela). */
export function Money({ amount, className }: { amount: number | null | undefined; className?: string }) {
  return amount != null && <span className={className}>{formatMoney(amount)}</span>;
}

/** Narzędzia lokalizacji z tablicy: kod, nazwa, dopiski, dni i (dla właściciela) wartość. */
export function ToolList({ tools, wide, atBase }: { tools: ToolOnBoard[]; wide?: boolean; atBase?: boolean }) {
  return (
    <ul className={wide ? "tool-list tool-list-wide" : "tool-list"}>
      {tools.map((tool) => (
        <li key={tool.id}>
          <Link
            href={`/narzedzia/${tool.id}`}
            className={tool.alarm ? "tool-row tool-row-alarm" : "tool-row"}
            data-tour={tool.alarm ? "alarm-tool" : undefined}
          >
            <span className="plate">{tool.code}</span>
            <span className="tool-row-name">
              {tool.name}
              {tool.registration === "zgloszone" && <span className="tag tag-reported">{t("board.reported")}</span>}
              {tool.damagedSince && (
                <span className="tag tag-damaged">
                  <DamagedIcon /> {t("board.damaged")}
                </span>
              )}
              {tool.reportedMissing && (
                <span className="tag tag-missing">
                  <MissingIcon /> {t("board.reportedMissing")}
                </span>
              )}
              {tool.rented && <span className="tag tag-rented">{t("board.rented")}</span>}
              {tool.returnOverdue && <span className="tag tag-alarm">{t("board.returnOverdue")}</span>}
              {tool.alarm && <span className="tag tag-alarm">{t("board.overThreshold")}</span>}
              {tool.nextDeadline?.overdue && (
                <span className="tag tag-alarm">{t("deadlines.overdueTag", { kind: deadlineKindName(tool.nextDeadline.kind) })}</span>
              )}
            </span>
            <span className="tool-row-meta">
              <span className="tool-row-days">
                {atBase ? t("board.unused", { days: formatDays(tool.daysInPlace) }) : formatDays(tool.daysInPlace)}
              </span>
              <Money amount={tool.value} className="tool-row-value" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
