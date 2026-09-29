import Link from "next/link";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { deadlineKindName, nextDeadlineText } from "@/lib/deadline-text";
import type { SearchTool } from "@/lib/tool-search";
import { DamagedIcon } from "./damaged-icon";
import { VehicleIcon } from "./vehicle-icon";

const KIND_LABELS = { baza: "board.baseKind", budowa: "board.siteKind", serwis: "board.serviceKind", pojazd: "board.vehicleKind" } as const;

/**
 * Znalezione narzędzia (wyszukiwanie i odpowiedź na „gdzie jest …”): kod i nazwa, a pod nimi gdzie są, od ilu dni,
 * kto za nie odpowiada i (w wyszukiwaniu) najbliższy termin. Każde otwiera kartę narzędzia.
 */
export function FoundToolList({ tools }: { tools: SearchTool[] }) {
  return (
    <ul className="tool-list tool-list-wide found-tools">
      {tools.map((tool) => (
        <li key={tool.id}>
          <Link href={`/narzedzia/${tool.id}`} className={tool.alarm ? "tool-row tool-row-alarm" : "tool-row"}>
            <span className="plate">{tool.code}</span>
            <span className="tool-row-name">
              {tool.name}
              {tool.damaged && (
                <span className="tag tag-damaged">
                  <DamagedIcon /> {t("board.damaged")}
                </span>
              )}
              {tool.alarm && <span className="tag tag-alarm">{t("board.overThreshold")}</span>}
              {tool.nextDeadline?.overdue && (
                <span className="tag tag-alarm">{t("deadlines.overdueTag", { kind: deadlineKindName(tool.nextDeadline.kind) })}</span>
              )}
              <span className="tool-row-sub found-tool-place">
                {tool.lost || !tool.place.kind ? (
                  <strong className="text-danger">{t("search.lost", { place: tool.place.name })}</strong>
                ) : (
                  <>
                    <span className={tool.place.kind === "baza" ? "location-kind location-kind-base" : "location-kind"}>
                      {tool.place.kind === "pojazd" && <VehicleIcon />} {t(KIND_LABELS[tool.place.kind])}
                    </span>{" "}
                    <strong>{tool.place.name}</strong>
                  </>
                )}
                {tool.responsible && <span className="muted"> · {t("search.responsible", { name: tool.responsible })}</span>}
              </span>
              {tool.nextDeadline && (
                <span className={tool.nextDeadline.overdue ? "tool-row-sub text-danger" : "tool-row-sub muted"} data-testid="found-tool-deadline">
                  {nextDeadlineText(tool.nextDeadline)}
                </span>
              )}
            </span>
            <span className="tool-row-meta">
              <span className="tool-row-days">
                {tool.lost ? t("board.lostFor", { days: formatDays(tool.daysInPlace) }) : t("search.since", { days: formatDays(tool.daysInPlace) })}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
