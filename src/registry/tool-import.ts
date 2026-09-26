import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Session } from "./registry";
import {
  baseLocation,
  type Category,
  isUniqueViolation,
  listCategories,
  type LocationKind,
  MAX_VALUE,
  nextCodes,
  normalizeCode,
  ReplayedOperationError,
  uniqueOr,
} from "./tools";
import { UUID_PATTERN } from "./validation";

/** Wiersz pliku po zmapowaniu kolumn na pola karty: teksty tak, jak są w komórkach. */
export interface ToolImportRow {
  /** Pusty: kolejny wolny kod w kategorii. */
  code?: string | null;
  name?: string | null;
  /** Nazwa albo prefiks kategorii firmy. */
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  /** Wartość w zł, np. „3 200,50” albo „3200.50 zł”. */
  value?: string | null;
  /** Nazwa bazy, aktywnej budowy albo serwisu; pusta: baza. */
  location?: string | null;
}

export type ImportRowError =
  | "name_missing"
  | "category_missing"
  | "category_unknown"
  | "code_invalid"
  /** Ten sam kod ma w pliku więcej niż jeden wiersz. */
  | "code_repeated"
  /** Kod ma już narzędzie w firmie. */
  | "code_taken"
  | "value_invalid"
  | "location_unknown"
  /** Tę nazwę ma więcej niż jedna lokalizacja firmy. */
  | "location_ambiguous"
  | "site_finished";

export interface ImportPreviewRow {
  /** Kod z pliku albo nadany; null, gdy nie da się go ustalić (zły kod, nieznana kategoria). */
  code: string | null;
  /** Kod nadał Rejestr, bo w pliku go nie było. */
  codeAssigned: boolean;
  name: string | null;
  category: Category | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  value: number | null;
  /** Dokąd trafi narzędzie: lokalizacja z pliku albo baza. */
  location: { id: string; name: string; kind: LocationKind } | null;
  errors: ImportRowError[];
}

export interface ToolImportPreview {
  /** W kolejności wierszy pliku. */
  rows: ImportPreviewRow[];
  /** Liczba wierszy z błędami; import zapisze się tylko bez nich. */
  invalidRows: number;
}

export interface ImportToolsInput {
  /** Identyfikator operacji klienta: ponowne wysłanie zwraca pierwotny wynik. */
  operationId: string;
  rows: ToolImportRow[];
}

export const MAX_IMPORT_ROWS = 2000;

const ROW_FIELDS = ["code", "name", "category", "brand", "model", "serialNumber", "value", "location"] as const;

/** Import wgrywa właściciel: ustala stan początkowy ewidencji razem z wartościami. */
export function canImportTools(session: Session) {
  return session.role === "wlasciciel";
}

export function requireImporter(session: Session) {
  if (!canImportTools(session)) throw new RegistryError("forbidden");
}

/**
 * Sprawdza wiersze względem firmy i nadaje kody wierszom bez kodu (według kategorii, za najwyższym
 * numerem w firmie i w pliku). Nic nie zapisuje.
 */
export async function previewToolImport(sql: Sql, session: Session, rows: ToolImportRow[]): Promise<ToolImportPreview> {
  requireValidRows(rows);
  const categories = await listCategories(sql);
  const taken = new Set((await sql<{ code: string }>("select code from app.tools")).map(({ code }) => code));
  const locations = await sql<{ id: string; name: string; kind: LocationKind; status: "aktywna" | "zakonczona" | null }>(
    "select id, name, kind, status from app.locations",
  );
  const base = { ...(await baseLocation(sql, session)), kind: "baza" as const };

  const preview = rows.map((raw): ImportPreviewRow => {
    const errors: ImportRowError[] = [];
    const rawCode = text(raw.code);
    const code = rawCode === null ? null : normalizeCode(rawCode);
    if (rawCode !== null && code === null) errors.push("code_invalid");
    if (code && taken.has(code)) errors.push("code_taken");

    const name = text(raw.name);
    if (!name) errors.push("name_missing");

    const categoryText = text(raw.category);
    const category = categoryText ? findCategory(categories, categoryText) : null;
    if (!categoryText) errors.push("category_missing");
    else if (!category) errors.push("category_unknown");

    const value = parseValue(raw.value);
    if (value === undefined) errors.push("value_invalid");

    const locationText = text(raw.location);
    let location: ImportPreviewRow["location"] = base;
    if (locationText) {
      const matches = locations.filter((candidate) => sameName(candidate.name, locationText));
      location = matches.length === 1 ? { id: matches[0].id, name: matches[0].name, kind: matches[0].kind } : null;
      if (matches.length === 0) errors.push("location_unknown");
      else if (matches.length > 1) errors.push("location_ambiguous");
      else if (matches[0].status === "zakonczona") {
        errors.push("site_finished");
        location = null;
      }
    }

    return {
      code,
      codeAssigned: false,
      name,
      category,
      brand: text(raw.brand),
      model: text(raw.model),
      serialNumber: text(raw.serialNumber),
      value: value ?? null,
      location,
      errors,
    };
  });

  const fileCodes = new Map<string, number>();
  for (const row of preview) if (row.code) fileCodes.set(row.code, (fileCodes.get(row.code) ?? 0) + 1);
  for (const row of preview) if (row.code && fileCodes.get(row.code)! > 1) row.errors.push("code_repeated");

  // Nowe numery idą za najwyższym numerem w firmie i w pliku, więc nie zderzą się z żadnym z nich.
  const used = [...taken, ...fileCodes.keys()];
  for (const category of categories) {
    const missing = preview.filter((row) => row.code === null && row.category?.id === category.id && !row.errors.includes("code_invalid"));
    nextCodes(category.prefix, used, missing.length).forEach((code, i) => {
      missing[i].code = code;
      missing[i].codeAssigned = true;
    });
  }

  return { rows: preview, invalidRows: preview.filter((row) => row.errors.length > 0).length };
}

/**
 * Zapisuje import w całości albo wcale: wszystkie narzędzia z kodami i wartościami, a każde z ruchem
 * `przyjecie` (źródło `import`) do lokalizacji z pliku. Wiersz z błędem odrzuca cały import.
 */
export async function importTools(sql: Sql, session: Session, input: ImportToolsInput, now: Date): Promise<{ imported: number }> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const [done] = await sql<{ tool_count: number }>("select tool_count from app.tool_imports where client_operation_id = $1", [
    input.operationId,
  ]);
  if (done) return { imported: done.tool_count };

  requireImporter(session);
  const { rows, invalidRows } = await previewToolImport(sql, session, input.rows);
  if (invalidRows > 0) throw new RegistryError("import_invalid");

  // Wpis importu zapisujemy przed narzędziami: równoległa ponowka tej samej operacji czeka wtedy
  // na unikalnym identyfikatorze operacji, zanim cokolwiek zapisze.
  await sql(
    `insert into app.tool_imports (company_id, client_operation_id, author_id, tool_count, created_at)
     values ($1, $2, $3, $4, $5)`,
    [session.company.id, input.operationId, session.userId, rows.length, now],
  ).catch((error) => {
    throw isUniqueViolation(error, "tool_imports_operation_per_company") ? new ReplayedOperationError() : error;
  });

  const column = <T>(pick: (row: ImportPreviewRow) => T) => rows.map(pick);
  const tools = await uniqueOr(
    sql<{ id: string; code: string }>(
      `insert into app.tools (company_id, code, name, category_id, brand, model, serial_number, location_id, located_since, created_at)
       select $1, r.code, r.name, r.category_id, r.brand, r.model, r.serial_number, r.location_id, $2, $2
       from unnest($3::text[], $4::text[], $5::uuid[], $6::text[], $7::text[], $8::text[], $9::uuid[])
         as r(code, name, category_id, brand, model, serial_number, location_id)
       returning id, code`,
      [
        session.company.id,
        now,
        column((row) => row.code),
        column((row) => row.name),
        column((row) => row.category!.id),
        column((row) => row.brand),
        column((row) => row.model),
        column((row) => row.serialNumber),
        column((row) => row.location!.id),
      ],
    ),
  );
  const toolIdByCode = new Map(tools.map((tool) => [tool.code, tool.id]));
  const toolId = (row: ImportPreviewRow) => toolIdByCode.get(row.code!)!;

  const valued = rows.filter((row) => row.value !== null);
  if (valued.length > 0) {
    await sql(
      `insert into app.tool_values (tool_id, company_id, value)
       select tool_id, $1, value from unnest($2::uuid[], $3::numeric[]) as r(tool_id, value)`,
      [session.company.id, valued.map(toolId), valued.map((row) => row.value)],
    );
  }

  // Jedno przyjęcie na lokalizację docelową, w kolejności pierwszego wystąpienia w pliku.
  const byLocation = Map.groupBy(rows, (row) => row.location!.id);
  for (const [locationId, group] of byLocation) {
    const [movement] = await sql<{ id: string }>(
      `insert into app.movements (company_id, kind, source, to_location_id, author_id, occurred_at, recorded_at, client_operation_id)
       values ($1, 'przyjecie', 'import', $2, $3, $4, $4, gen_random_uuid()) returning id`,
      [session.company.id, locationId, session.userId, now],
    );
    await sql(
      `insert into app.movement_tools (movement_id, tool_id, company_id)
       select $1, tool_id, $2 from unnest($3::uuid[]) as tool_id`,
      [movement.id, session.company.id, group.map(toolId)],
    );
  }
  return { imported: rows.length };
}

function requireValidRows(rows: unknown): asserts rows is ToolImportRow[] {
  const valid =
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.length <= MAX_IMPORT_ROWS &&
    rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        ROW_FIELDS.every((field) => {
          const value = (row as Record<string, unknown>)[field];
          return value === undefined || value === null || typeof value === "string";
        }),
    );
  if (!valid) throw new RegistryError("invalid_input");
}

/** Tekst bez spacji na brzegach; pusty to brak danych. */
function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function sameName(a: string, b: string) {
  const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl");
  return normalize(a) === normalize(b);
}

/** Kategoria po nazwie („Młoty”) albo prefiksie („H”). */
function findCategory(categories: Category[], name: string) {
  return categories.find((category) => sameName(category.name, name)) ?? categories.find((category) => category.prefix === name.trim().toUpperCase()) ?? null;
}

/**
 * Wartość w zł z komórki: „3200”, „3200.5”, „3 200,50”, „3200 zł”. Brak to null, zły zapis
 * (litery, ujemna, więcej niż grosze, ponad limit) to undefined.
 */
function parseValue(raw: string | null | undefined): number | null | undefined {
  const cell = text(raw);
  if (cell === null) return null;
  const normalized = cell
    .replace(/zł$/i, "")
    .replace(/[\s  ]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return value <= MAX_VALUE ? value : undefined;
}
