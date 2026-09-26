import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { warsawWallClock } from "@/i18n/dates";
import { stateChangeText } from "@/i18n/movement-text";
import { t } from "@/i18n/t";
import type { ExportData, ToolOnBoard } from "@/registry/registry";

const DATE_TIME_FORMAT = "dd.mm.yyyy hh:mm";

/**
 * Plik XLSX z dwoma arkuszami: stan „Gdzie jest co” i historia ruchów. Kolumna wartości jest tylko
 * wtedy, gdy Rejestr podał wartości, czyli dla właściciela.
 */
export async function exportWorkbook({ board, movements }: ExportData): Promise<Buffer> {
  const withValues = board.offBaseValue !== undefined;
  const header = (labels: string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" }));

  const toolRow = (place: string, kind: string, manager: string | null, tool: ToolOnBoard): Row => [
    place,
    kind,
    manager,
    tool.code,
    tool.name,
    t("toolState.w_obiegu"),
    tool.daysInPlace,
    tool.alarm ? t("board.overThreshold") : null,
    ...(withValues ? [money(tool.value)] : []),
  ];
  const state: Row[] = [
    header([
      t("export.location"),
      t("export.locationKind"),
      t("export.manager"),
      t("export.code"),
      t("export.name"),
      t("export.state"),
      t("export.days"),
      t("export.alarm"),
      ...(withValues ? [t("export.value")] : []),
    ]),
    ...board.base.tools.map((tool) => toolRow(board.base.name, t("board.baseKind"), null, tool)),
    ...board.sites.flatMap((site) => site.tools.map((tool) => toolRow(site.name, t("board.siteKind"), site.manager.fullName, tool))),
    ...board.services.flatMap((service) => service.tools.map((tool) => toolRow(service.name, t("board.serviceKind"), null, tool))),
    ...board.lost.map((tool): Row => [
      tool.lastLocation.name,
      null,
      tool.responsible,
      tool.code,
      tool.name,
      t("toolState.zaginione"),
      tool.daysLost,
      null,
      ...(withValues ? [money(tool.value)] : []),
    ]),
  ];

  const history: Row[] = [
    header([
      t("export.occurredAt"),
      t("export.kind"),
      t("export.tools"),
      t("export.from"),
      t("export.to"),
      t("export.author"),
      t("export.source"),
      t("export.reason"),
      t("export.stateChange"),
      t("export.undone"),
      t("export.recordedAt"),
    ]),
    ...movements.map((movement): Row => [
      dateTime(movement.occurredAt),
      t(`movementKind.${movement.kind}`),
      movement.tools.map((tool) => t("checklist.toolLabel", { code: tool.code, name: tool.name })).join(", "),
      movement.from?.name ?? null,
      movement.to?.name ?? null,
      movement.author,
      t(`movementSource.${movement.source}`),
      movement.reason,
      stateChangeText(movement.stateChange),
      movement.undoneBy ? t("export.undoneYes") : null,
      dateTime(movement.recordedAt),
    ]),
  ];

  return writeXlsxFile([
    {
      sheet: t("export.stateSheet"),
      data: state,
      stickyRowsCount: 1,
      columns: [{ width: 22 }, { width: 16 }, { width: 20 }, { width: 10 }, { width: 28 }, { width: 12 }, { width: 11 }, { width: 10 }, { width: 14 }],
    },
    {
      sheet: t("export.historySheet"),
      data: history,
      stickyRowsCount: 1,
      columns: [{ width: 17 }, { width: 12 }, { width: 40 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 11 }, { width: 30 }, { width: 22 }, { width: 10 }, { width: 17 }],
    },
  ]).toBuffer();
}

function dateTime(date: Date): Cell {
  return { value: warsawWallClock(date), format: DATE_TIME_FORMAT };
}

function money(amount: number | null | undefined): Cell {
  return amount == null ? null : { value: amount, format: t("export.moneyFormat") };
}
