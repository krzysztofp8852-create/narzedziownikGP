import { isAmount } from "./costs";
import { RegistryError } from "./errors";
import { attachTools, canHandleRentalsAt, canRegisterMovements, insertMovement, location, type LocationRow, type Movement, movementById, requireOpen } from "./movements";
import type { RentedToolNotification } from "./notifications";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import { owners } from "./reports";
import { intake, intakeByOperation, type ToolState } from "./tools";
import { isCalendarDay, UUID_PATTERN } from "./validation";

/** Sprzęt wynajęty z wypożyczalni, przyjęty od razu w lokalizacji, w której stoi. */
export interface AddRentedToolInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny wynik. */
  operationId: string;
  /** Baza, budowa albo pojazd, w których sprzęt stoi. */
  locationId: string;
  name: string;
  categoryId: string;
  /** Nazwa wypożyczalni. */
  rentalCompany: string;
  /** Stawka dobowa z umowy w zł. */
  dailyRate: number;
  /** Termin zwrotu (RRRR-MM-DD). */
  returnOn: string;
  /** Wartość w zł. Tylko właściciel. */
  value?: number | null;
}

export interface ReturnToRentalInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny ruch. */
  operationId: string;
  toolId: string;
}

export const MAX_RENTAL_COMPANY_LENGTH = 100;

/** Sprzęt wynajęty stoi w bazie, na budowie albo na pojeździe; serwis go nie przyjmuje. */
function isRentalPlace(place: LocationRow): place is LocationRow & { kind: "baza" | "budowa" | "pojazd" } {
  return place.kind !== "serwis";
}

/** Sprzęt wynajęty przyjmują wszyscy poza pracownikiem, każdy w lokalizacjach, w których obsługuje wynajem. */
export function canRentTools(session: Session) {
  return canRegisterMovements(session);
}

/**
 * Przyjęcie sprzętu wynajętego: narzędzie z kolejnym kodem w kategorii, zaakceptowane, od razu w obiegu w podanej
 * lokalizacji, ze stawką wypożyczalni i terminem zwrotu. Zwraca też wpisy dzwonka dla właścicieli (poza aktorem).
 * Ponowne wysłanie tej samej operacji zwraca pierwotne narzędzie bez wpisów.
 */
export async function addRentedTool(
  sql: Sql,
  session: Session,
  input: AddRentedToolInput,
  now: Date,
): Promise<{ toolId: string; code: string; notifications: RentedToolNotification[] }> {
  if (!canRentTools(session)) throw new RegistryError("forbidden");
  const done = await intakeByOperation(sql, input.operationId);
  if (done) return { ...done, notifications: [] };

  const rentalCompany = typeof input.rentalCompany === "string" ? input.rentalCompany.trim() : "";
  if (!rentalCompany || rentalCompany.length > MAX_RENTAL_COMPANY_LENGTH || !isAmount(input.dailyRate) || !isCalendarDay(input.returnOn)) {
    throw new RegistryError("invalid_input");
  }
  const place = await location(sql, input.locationId);
  if (!place || !isRentalPlace(place)) throw new RegistryError("invalid_input");
  if (!canHandleRentalsAt(session, { kind: place.kind, managerId: place.manager_id })) throw new RegistryError("forbidden");
  requireOpen(place);

  const tool = await intake(
    sql,
    session,
    { operationId: input.operationId, name: input.name, categoryId: input.categoryId, ...(input.value !== undefined && { value: input.value }) },
    { locationId: place.id, registration: "zaakceptowane", rentedFrom: rentalCompany },
    now,
  );
  await sql("insert into app.rental_rates (tool_id, company_id, amount, recorded_at) values ($1, $2, $3, $4)", [
    tool.toolId,
    session.company.id,
    input.dailyRate,
    now,
  ]);
  await sql("insert into app.tool_deadlines (company_id, tool_id, kind, due_on, created_at) values ($1, $2, 'zwrot', $3, $4)", [
    session.company.id,
    tool.toolId,
    input.returnOn,
    now,
  ]);

  const [name] = await sql<{ name: string }>("select name from app.tools where id = $1", [tool.toolId]);
  const notifications = (await owners(sql, session.company.id))
    .filter((owner) => owner.userId !== session.userId)
    .map(
      (owner): RentedToolNotification => ({
        kind: "sprzet_wynajety",
        recipient: { userId: owner.userId, fullName: owner.fullName },
        tool: { id: tool.toolId, code: tool.code, name: name.name },
        location: { id: place.id, name: place.name, kind: place.kind },
        rentalCompany,
        returnOn: input.returnOn,
        addedBy: session.fullName,
      }),
    );
  return { ...tool, notifications };
}

/**
 * Zwrot do wypożyczalni: sprzęt wynajęty w obiegu przechodzi w stan „zwrócone” i znika z tablicy, a ruch zostaje
 * w historii. Zapisuje go kierownik lokalizacji, w której sprzęt stoi, magazynier albo właściciel.
 */
export async function returnToRental(sql: Sql, session: Session, input: ReturnToRentalInput, now: Date): Promise<Movement> {
  const [tool] = UUID_PATTERN.test(input.toolId)
    ? await sql<{ id: string; state: ToolState; location_id: string; rented_from: string | null }>(
        "select id, state, location_id, rented_from from app.tools where id = $1",
        [input.toolId],
      )
    : [];
  if (!tool) throw new RegistryError("not_found");
  if (tool.rented_from === null) throw new RegistryError("not_rented");
  const place = (await location(sql, tool.location_id))!;
  if (!canHandleRentalsAt(session, { kind: place.kind, managerId: place.manager_id })) throw new RegistryError("forbidden");
  if (tool.state !== "w_obiegu") throw new RegistryError("invalid_tool_state");

  const movementId = await insertMovement(sql, session, {
    kind: "zwrot_do_wypozyczalni",
    source: "panel",
    fromLocationId: place.id,
    toLocationId: null,
    occurredAt: now,
    recordedAt: now,
    operationId: input.operationId,
    fromState: "w_obiegu",
    toState: "zwrocone",
  });
  await attachTools(sql, session, movementId, [tool.id]);
  return (await movementById(sql, movementId))!;
}
