import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeZipFile } from "@/export/zip-file";
import { EXPORT_TABLES } from "./company-export";
import type { Db } from "./ports";
import { givenCompanyWithHistory, zawbud } from "./testing/company-with-history";
import { setupRegistryTestbed } from "./testing/harness";
import { parseCsv } from "./testing/parse-csv";

const testbed = setupRegistryTestbed();

const budrex = {
  ...zawbud,
  name: "Budrex",
  owner: { email: "anna@budrex.pl", fullName: "Anna Lis" },
  invoice: { name: "Budrex Anna Lis", taxId: "525-000-00-09", address: "ul. Leśna 7\n61-001 Poznań" },
};

/** Pliki eksportu po ścieżce w ZIP-ie. */
async function exportOf(companyId: string) {
  const files = new Map<string, Uint8Array>();
  const summary = await testbed.registry.system().exportCompany(companyId, async (path, content) => {
    if (files.has(path)) throw new Error(`Drugi raz ${path}`);
    files.set(path, content);
  });
  const table = (name: string) => parseCsv(files.get(`dane/${name}.csv`)!);
  return { files, summary, csv: (name: string) => table(name).rows, header: (name: string) => table(name).columns };
}

/** Tabele `app` z danymi firm (po `company_id`, poza dziennikami demo i usuniętych firm) z kolumnami. */
async function companyTables(db: Db) {
  const rows = await db.transaction((sql) =>
    sql<{ table_name: string; column_name: string }>(
      `select c.table_name, c.column_name from information_schema.columns c
       where c.table_schema = 'app'
         and (c.table_name in ('companies', 'support_messages') or c.table_name in (
           select table_name from information_schema.columns where table_schema = 'app' and column_name = 'company_id'
           and table_name not in ('demo_events', 'company_deletions')))
       order by c.table_name, c.ordinal_position`,
    ),
  );
  const tables = new Map<string, string[]>();
  for (const row of rows) tables.set(row.table_name, [...(tables.get(row.table_name) ?? []), row.column_name]);
  return tables;
}

/** Ile wierszy firmy jest w tabeli (wiadomości czatu po wątku, firma po `id`). */
async function rowCount(db: Db, table: string, companyId: string) {
  const where =
    table === "companies"
      ? "id = $1"
      : table === "support_messages"
        ? "thread_id in (select user_id from app.support_threads where company_id = $1)"
        : "company_id = $1";
  const [row] = await db.transaction((sql) => sql<{ count: number }>(`select count(*)::int as count from app.${table} where ${where}`, [companyId]));
  return row.count;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("pełny eksport danych firmy", () => {
  it("CSV każdej tabeli firmy ze wszystkimi jej wierszami, pliki z magazynów nazwane po wierszu i README z opisem", async () => {
    const company = await givenCompanyWithHistory(testbed, await testbed.givenSuperAdmin());

    const { files, summary, csv, header } = await exportOf(company.companyId);

    const tables = await companyTables(testbed.db);
    for (const [table, columns] of tables) {
      const rows = csv(table);
      expect(rows, table).toHaveLength(await rowCount(testbed.db, table, company.companyId));
      const omitted = Object.keys(EXPORT_TABLES.find((spec) => spec.table === table)?.omitted ?? {});
      expect([...header(table), ...omitted].sort(), table).toEqual([...columns].sort());
      for (const row of rows) if ("company_id" in row) expect(row.company_id, table).toBe(company.companyId);
    }
    expect(csv("companies")).toEqual([expect.objectContaining({ id: company.companyId, name: "Zawbud" })]);
    expect(csv("subscriptions")).toEqual([expect.objectContaining({ tax_id: "7781234563", invoice_address: "ul. Polna 3\n60-001 Poznań", paid_until: "2026-12-31" })]);
    expect(csv("tools")).toEqual([expect.objectContaining({ code: "S-01", state: "w_obiegu", location_id: company.siteId, damaged_since: null })]);
    expect(csv("tool_values")).toEqual([{ tool_id: company.toolId, company_id: company.companyId, value: "300.00" }]);
    expect(csv("movements")[0]).toMatchObject({ kind: "przyjecie", occurred_at: "2026-03-02T06:00:00.000000Z" });

    const [issue] = csv("issues");
    const [message] = csv("support_messages");
    const [deadlineDocument] = csv("tool_deadline_documents");
    const [qualificationDocument] = csv("qualification_documents");
    const stored = [
      [`pliki/zdjecia-zgloszen/${issue.id}.jpg`, testbed.photos.photos.get(issue.photo_path!)],
      [`pliki/zdjecia-czatu/${message.id}.jpg`, testbed.chatPhotos.photos.get(message.photo_path!)],
      [`pliki/dokumenty-terminow/${deadlineDocument.id}.jpg`, testbed.documents.photos.get(deadlineDocument.file_path!)],
      [`pliki/dokumenty-uprawnien/${qualificationDocument.id}.jpg`, testbed.documents.photos.get(qualificationDocument.file_path!)],
    ] as const;
    for (const [path, blob] of stored) expect(files.get(path), path).toEqual(new Uint8Array(await blob!.arrayBuffer()));

    expect([...files.keys()].sort()).toEqual(
      ["README.md", ...[...tables.keys()].map((table) => `dane/${table}.csv`), ...stored.map(([path]) => path)].sort(),
    );
    const readme = text(files.get("README.md")!);
    expect(readme).toContain("Zawbud");
    for (const [table, columns] of tables) {
      expect(readme).toContain(`dane/${table}.csv`);
      for (const column of columns.filter((column) => column !== "company_id")) expect(readme, `${table}.${column}`).toContain(`\`${column}\``);
    }
    expect(readme).toContain("tools.id");
    expect(summary).toEqual({ companyName: "Zawbud", tables: tables.size, files: 4, missingFiles: [] });
  });

  it("bez kluczy powiadomień push: urządzenie jest w eksporcie, a jego adres, klucze i token nie", async () => {
    const company = await testbed.givenActiveCompany("Zawbud");
    const owner = testbed.registry.as(company.ownerId);
    await owner.subscribeToPush({ kind: "przegladarka", endpoint: "https://fcm.googleapis.com/fcm/send/adres-123", keys: { p256dh: "klucz-p256dh", auth: "sekret-auth" } });
    await owner.subscribeToPush({ kind: "aplikacja", token: "token-fcm-456:APA91bH" });

    const { files, csv } = await exportOf(company.companyId);

    expect(csv("push_subscriptions").map((row) => row.kind).sort()).toEqual(["aplikacja", "przegladarka"]);
    const everything = [...files.values()].map(text).join("\n");
    for (const secret of ["adres-123", "klucz-p256dh", "sekret-auth", "token-fcm-456"]) expect(everything).not.toContain(secret);
  });

  it("eksport firmy A nie zawiera żadnego wiersza ani pliku firmy B", async () => {
    const adminId = await testbed.givenSuperAdmin();
    const a = await givenCompanyWithHistory(testbed, adminId);
    const b = await givenCompanyWithHistory(testbed, adminId, budrex);

    const exportA = await exportOf(a.companyId);
    const exportB = await exportOf(b.companyId);

    const uuids = (files: Map<string, Uint8Array>) =>
      new Set([...files.values()].flatMap((content) => text(content).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []));
    const idsOfB = uuids(exportB.files);
    expect(idsOfB.size).toBeGreaterThan(30);
    expect([...uuids(exportA.files)].filter((id) => idsOfB.has(id))).toEqual([]);
    expect([...exportA.files.values()].map(text).join("\n")).not.toContain("Budrex");
    const filesOfB = [...exportB.files.keys()].filter((path) => path.startsWith("pliki/"));
    expect(filesOfB).toHaveLength(4);
    for (const path of filesOfB) expect(exportA.files.has(path)).toBe(false);
  });

  it("działa w trybie tylko do odczytu i po końcu umowy, a niczego w firmie nie zmienia", async () => {
    const admin = testbed.registry.superAdmin(await testbed.givenSuperAdmin());
    const company = await givenCompanyWithHistory(testbed, await testbed.givenSuperAdmin());
    await admin.setManualReadOnly(company.companyId, true);
    const { companyId: endedId } = await admin.createCompany({ ...budrex, paidUntil: "2026-02-01" });
    const tables = [...(await companyTables(testbed.db)).keys()];
    const before = await Promise.all(tables.map((table) => rowCount(testbed.db, table, company.companyId)));

    const readOnly = await exportOf(company.companyId);
    const ended = await exportOf(endedId);

    expect(readOnly.summary).toMatchObject({ files: 4, missingFiles: [] });
    expect(readOnly.csv("movements").length).toBeGreaterThan(0);
    expect(ended.csv("companies")).toEqual([expect.objectContaining({ name: "Budrex" })]);
    expect(ended.csv("subscriptions")).toEqual([expect.objectContaining({ paid_until: "2026-02-01" })]);
    expect(await Promise.all(tables.map((table) => rowCount(testbed.db, table, company.companyId)))).toEqual(before);
  });

  it("plik, którego nie ma w magazynie, nie zatrzymuje eksportu: trafia do podsumowania i README", async () => {
    const company = await givenCompanyWithHistory(testbed, await testbed.givenSuperAdmin());
    testbed.photos.clear();

    const { files, summary, csv } = await exportOf(company.companyId);

    const missing = `pliki/zdjecia-zgloszen/${csv("issues")[0].id}.jpg`;
    expect(summary).toMatchObject({ files: 3, missingFiles: [missing] });
    expect(files.has(missing)).toBe(false);
    expect(text(files.get("README.md")!)).toContain(missing);
  });

  it("eksport zapisany do ZIP-u tak jak w skrypcie ma te same pliki, bajt w bajt", async () => {
    const company = await givenCompanyWithHistory(testbed, await testbed.givenSuperAdmin());
    const path = join(mkdtempSync(join(tmpdir(), "eksport-")), "eksport.zip");

    const summary = await writeZipFile(path, (add) => testbed.registry.system().exportCompany(company.companyId, add));

    const unzipped = unzipSync(readFileSync(path));
    const { files } = await exportOf(company.companyId);
    expect(summary.files).toBe(4);
    expect(Object.keys(unzipped).sort()).toEqual([...files.keys()].sort());
    for (const [name, content] of files) expect(unzipped[name], name).toEqual(content);
  });

  it("nieznana firma: not_found i żadnego pliku", async () => {
    await testbed.givenActiveCompany("Zawbud");

    for (const companyId of [randomUUID(), "nie-uuid"]) {
      const files: string[] = [];
      await expect(testbed.registry.system().exportCompany(companyId, async (path) => void files.push(path))).rejects.toMatchObject({ code: "not_found" });
      expect(files).toEqual([]);
    }
  });
});
