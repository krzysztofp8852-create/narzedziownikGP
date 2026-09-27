import { RegistryError } from "./errors";
import { type Site, SITE_COLUMNS, siteFromRow, type SiteRow } from "./locations";
import { attachTools, ConcurrentMoveError, insertMovement, type Movement, movementById } from "./movements";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { UUID_PATTERN } from "./validation";

export interface ForceCloseSiteInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotne zaginięcie. */
  operationId: string;
  siteId: string;
  /** Dlaczego pozostałe narzędzia są zaginione; obowiązkowy. */
  reason: string;
}

/** Zakończona budowa: kiedy i kto ją zamknął. */
export interface FinishedSite extends Site {
  finishedAt: Date;
  finishedBy: string;
}

/** Kierownik zamyka swoją budowę, właściciel każdą. */
export function canCloseSite(session: Session, site: { manager: { id: string } }) {
  return session.role === "wlasciciel" || (session.role === "kierownik" && site.manager.id === session.userId);
}

/** Zamknięcie budowy, na której zostały narzędzia, wymusza tylko właściciel. */
export function canForceCloseSites(session: Session) {
  return session.role === "wlasciciel";
}

/** Zamyka aktywną budowę, na której nie zostało żadne narzędzie w obiegu. */
export async function closeSite(sql: Sql, session: Session, siteId: string, now: Date): Promise<void> {
  const site = await siteToClose(sql, session, siteId);
  if ((await toolsLeft(sql, site.id)).length > 0) throw new RegistryError("site_not_empty");
  await finish(sql, session, site.id, now);
}

/**
 * Zamyka budowę mimo narzędzi, które na niej zostały: każde z nich zaginęło na tej budowie,
 * a odpowiada za nie jej kierownik. Pustą budowę po prostu zamyka (wtedy nie ma ruchu).
 */
export async function forceCloseSite(sql: Sql, session: Session, input: ForceCloseSiteInput, now: Date): Promise<Movement | null> {
  if (!canForceCloseSites(session)) throw new RegistryError("forbidden");
  const reason = input.reason?.trim();
  if (!reason) throw new RegistryError("reason_required");
  const site = await siteToClose(sql, session, input.siteId);

  const toolIds = await toolsLeft(sql, site.id);
  let lost: Movement | null = null;
  if (toolIds.length > 0) {
    const movementId = await insertMovement(sql, session, {
      kind: "zaginiecie",
      source: "panel",
      fromLocationId: site.id,
      toLocationId: null,
      occurredAt: now,
      recordedAt: now,
      operationId: input.operationId,
      reason,
      fromState: "w_obiegu",
      toState: "zaginione",
      responsibleUserId: site.manager.id,
    });
    await attachTools(sql, session, movementId, toolIds);
    lost = await movementById(sql, movementId);
  }
  await finish(sql, session, site.id, now);
  return lost;
}

/** Zakończone budowy, od ostatnio zamkniętej. */
export async function finishedSites(sql: Sql): Promise<FinishedSite[]> {
  const rows = await sql<SiteRow & { finished_at: Date; finished_by: string }>(
    `select ${SITE_COLUMNS}, l.finished_at, f.full_name as finished_by
     from app.locations l
     join app.users u on u.user_id = l.manager_id
     join app.users f on f.user_id = l.finished_by
     where l.kind = 'budowa' and l.status = 'zakonczona'
     order by l.finished_at desc, l.name`,
  );
  return rows.map((row) => ({ ...siteFromRow(row), finishedAt: new Date(row.finished_at), finishedBy: row.finished_by }));
}

/** Aktywna budowa firmy, którą aktor może zamknąć. */
async function siteToClose(sql: Sql, session: Session, siteId: string) {
  const [row] = UUID_PATTERN.test(siteId)
    ? await sql<{ id: string; status: Site["status"]; manager_id: string }>(
        "select id, status, manager_id from app.locations where id = $1 and kind = 'budowa'",
        [siteId],
      )
    : [];
  if (!row) throw new RegistryError("not_found");
  const site = { id: row.id, manager: { id: row.manager_id } };
  if (!canCloseSite(session, site)) throw new RegistryError("forbidden");
  if (row.status !== "aktywna") throw new RegistryError("site_finished");
  return site;
}

/** Narzędzia w obiegu, które są na budowie. Zaginione i wycofane nie blokują zamknięcia. */
async function toolsLeft(sql: Sql, siteId: string): Promise<string[]> {
  const rows = await sql<{ id: string }>("select id from app.tools where location_id = $1 and state = 'w_obiegu' order by code", [siteId]);
  return rows.map((row) => row.id);
}

async function finish(sql: Sql, session: Session, siteId: string, now: Date) {
  await sql("update app.locations set status = 'zakonczona', finished_at = $2, finished_by = $3 where id = $1", [
    siteId,
    now,
    session.userId,
  ]).catch((error) => {
    // Równoległy ruch dowiózł narzędzie po naszym sprawdzeniu; ponowienie je zobaczy.
    throw (error as { code?: string }).code === "GP409" ? new ConcurrentMoveError() : error;
  });
}
