import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { byCode } from "./tools";
import { UUID_PATTERN } from "./validation";

/** Które naklejki drukujemy: wybrane narzędzia albo wszystkie jeszcze nieoklejone (bez sprzętu wynajętego). */
export type StickerSelection = { toolIds: string[] } | { unlabeled: true };

export interface StickerBatch {
  companyName: string;
  /** Chwila druku według zegara Rejestru. */
  printedAt: Date;
  /** Po kodzie. `toolId` trafia do adresu w kodzie QR. */
  stickers: { toolId: string; code: string }[];
}

/** Narzędzie, któremu można wydrukować naklejkę. */
export interface StickerCandidate {
  toolId: string;
  code: string;
  name: string;
  /** Nazwa bieżącej lokalizacji. */
  location: string;
  /** Ostatni druk naklejki; null: jeszcze nieoklejone. */
  printedAt: Date | null;
  /** Sprzęt wynajęty: naklejka tylko z wyboru, druk wszystkich nieoklejonych go pomija. */
  rented: boolean;
}

export function canPrintStickers(session: Session) {
  return session.role === "wlasciciel";
}

export function requireStickerPrinter(session: Session) {
  if (!canPrintStickers(session)) throw new RegistryError("forbidden");
}

/**
 * Naklejka należy się narzędziu zaakceptowanemu i w obiegu: zgłoszone może jeszcze dostać inny kod
 * przy akceptacji, a zaginionego ani wycofanego nie ma czym okleić.
 */
const PRINTABLE = "t.state = 'w_obiegu' and t.registration = 'zaakceptowane'";

export async function stickerCandidates(sql: Sql): Promise<StickerCandidate[]> {
  const rows = await sql<StickerCandidate>(
    `select t.id as "toolId", t.code, t.name, l.name as location, t.sticker_printed_at as "printedAt",
            t.rented_from is not null as rented
     from app.tools t join app.locations l on l.id = t.location_id
     where ${PRINTABLE}`,
  );
  return rows
    .map((row) => ({ ...row, printedAt: row.printedAt && new Date(row.printedAt) }))
    .sort(byCode);
}

/**
 * Oznacza naklejki jako wydrukowane i zwraca je do druku. Wybrane narzędzie, któremu naklejka się
 * nie należy albo którego aktor nie widzi (inna firma), odrzuca cały druk jako nieznalezione.
 */
export async function printStickers(sql: Sql, session: Session, selection: StickerSelection, now: Date): Promise<StickerBatch> {
  let stickers: { toolId: string; code: string }[];
  if ("toolIds" in selection) {
    const toolIds = [...new Set(selection.toolIds)];
    if (toolIds.some((id) => !UUID_PATTERN.test(id))) throw new RegistryError("not_found");
    stickers = await sql(
      `update app.tools t set sticker_printed_at = $2
       where t.id = any($1::uuid[]) and ${PRINTABLE}
       returning t.id as "toolId", t.code`,
      [toolIds, now],
    );
    if (stickers.length < toolIds.length) throw new RegistryError("not_found");
  } else {
    stickers = await sql(
      `update app.tools t set sticker_printed_at = $1
       where t.sticker_printed_at is null and t.rented_from is null and ${PRINTABLE}
       returning t.id as "toolId", t.code`,
      [now],
    );
  }
  if (stickers.length === 0) throw new RegistryError("no_stickers");
  return {
    companyName: session.company.name,
    printedAt: now,
    stickers: stickers.sort(byCode),
  };
}
