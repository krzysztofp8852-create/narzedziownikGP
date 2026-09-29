import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isRegistryError } from "@/registry/errors";
import { setupRegistryTestbed, START } from "@/registry/testing/harness";
import { createDemoCompany, DEMO_COMPANY_NAME, refreshUsedDemo } from "./company";

const bed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const deps = () => ({ db: bed.db, authAdmin: bed.auth, photos: bed.photos, chatPhotos: bed.chatPhotos, documents: bed.documents });
const demo = (now = START) => createDemoCompany(deps(), { now });
const refresh = (now: Date) => refreshUsedDemo(deps(), { now });
const minutesAfterStart = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);

/** Wejście do demo w roli tego konta (strona /demo albo pasek demo): Supabase Auth zapisuje chwilę logowania. */
const enter = (userId: string, at: Date) =>
  bed.db.transaction((sql) => sql("update auth.users set last_sign_in_at = $2 where id = $1", [userId, at]));

/** Wejście ze strony /demo z komputera, w nowej sesji. */
const entry = (userId: string) => ({ userId, sessionId: randomUUID(), previousSessionId: null, switched: false, device: "komputer" as const });

/** Tabele `app` z wierszami tej firmy (po `company_id`, a sama firma po `id`). */
const rowsOfCompany = (companyId: string) =>
  bed.db.transaction(async (sql) => {
    const tables = await sql<{ name: string }>(
      "select table_name as name from information_schema.columns where table_schema = 'app' and column_name = 'company_id' and table_name <> 'demo_events'",
    );
    const found: string[] = [];
    for (const { name } of tables) {
      const [row] = await sql<{ count: number }>(`select count(*)::int as count from app.${name} where company_id = $1`, [companyId]);
      if (row.count > 0) found.push(name);
    }
    const [company] = await sql<{ count: number }>("select count(*)::int as count from app.companies where id = $1", [companyId]);
    return company.count > 0 ? [...found, "companies"] : found;
  });

function jpeg() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(1)])], { type: "image/jpeg" });
}

/** Firma obecnego demo. */
const currentDemoCompany = async () => {
  const [owner] = await bed.registry.system().demoAccounts();
  return (await bed.registry.as(owner.userId).session())?.company.id;
};

describe("firma demo", () => {
  it("ma konto każdej roli, do którego można wejść od razu", async () => {
    const { companyId } = await demo();
    const accounts = await bed.registry.system().demoAccounts();

    expect(accounts.map((account) => account.role)).toEqual([
      "wlasciciel",
      "kierownik",
      "kierownik",
      "kierownik",
      "magazynier",
      "pracownik",
      "pracownik",
      "pracownik",
      "pracownik",
    ]);
    for (const account of accounts) {
      const session = await bed.registry.as(account.userId).session();
      expect(session).toMatchObject({ mustChangePassword: false, company: { id: companyId, name: DEMO_COMPANY_NAME, readOnly: false, demo: true } });
    }
  });

  it("wygląda jak działająca firma: sprzęt na budowach i busach, alarmy, serwis, zaginione i sprawy do załatwienia", async () => {
    await demo();
    const [owner, manager, , , storekeeper, worker] = await bed.registry.system().demoAccounts();
    const board = await bed.registry.as(owner.userId).whereIsWhat();

    expect(board.sites.length).toBe(5);
    expect(board.vehicles.length).toBe(3);
    expect(board.alarmCount).toBe(5);
    expect(board.services.flatMap((service) => service.tools).length).toBe(2);
    expect(board.lost.length).toBe(1);
    expect(board.offBaseValue).toBeGreaterThan(50_000);

    const registry = bed.registry.as(owner.userId);
    expect(await registry.toolReports()).toHaveLength(2);
    expect((await registry.issues()).filter((issue) => issue.status === "otwarte")).toHaveLength(3);
    expect(await registry.finishedSites()).toHaveLength(1);
    // Terminy z najbliższego miesiąca: kalibracja po terminie, kalibracja za kilka dni, przegląd agregatu i koniec gwarancji.
    expect((await registry.upcomingDeadlines()).map((deadline) => [deadline.tool.code, deadline.kind, deadline.overdue])).toEqual([
      ["M-04", "kalibracja", true],
      ["M-01", "kalibracja", false],
      ["A-01", "przeglad", false],
      ["H-01", "gwarancja", false],
    ]);

    const marek = bed.registry.as(manager.userId);
    expect(await marek.movementsToClarify()).toHaveLength(1);
    expect(await marek.unreadNotificationCount()).toBeGreaterThan(0);
    expect((await bed.registry.as(storekeeper.userId).recentMovements()).length).toBeGreaterThan(5);
    expect(await bed.registry.as(worker.userId).issues()).toHaveLength(1);
  });

  it("dzwonek wygląda jak u pracującej firmy: właściciel ma alarmy i raporty, a kierownik alarm o swoim sprzęcie i raport", async () => {
    await demo();
    const [owner, manager] = await bed.registry.system().demoAccounts();
    const kinds = async (userId: string) => (await bed.registry.as(userId).bell()).entries.map((entry) => entry.notification.kind);

    expect(await kinds(owner.userId)).toEqual(expect.arrayContaining(["progi_przekroczone", "terminy", "raport_tygodniowy", "raport_piatkowy"]));
    expect(await kinds(manager.userId)).toEqual(expect.arrayContaining(["prog_przekroczony", "terminy", "raport_piatkowy"]));
    // Raporty tylko z ostatnich dwóch tygodni.
    expect((await kinds(owner.userId)).filter((kind) => kind === "raport_tygodniowy")).toHaveLength(2);
  });

  it("zadania harmonogramu scenariusza nie dotykają innych firm", async () => {
    const zawbud = await bed.givenActiveCompany("Zawbud");
    const nowakId = await bed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const registry = bed.registry.as(zawbud.ownerId);
    const { locationId: siteId } = await registry.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    const category = await registry.addCategory({ name: "Szlifierki", prefix: "S" });
    const { toolId } = await registry.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka", categoryId: category.id });
    const { base } = await registry.whereIsWhat();
    await bed.registry
      .as(nowakId)
      .registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: siteId, toolIds: [toolId], source: "checklista" });

    await demo(new Date(START.getTime() + 40 * DAY));

    expect((await registry.bell()).entries).toEqual([]);
    expect((await bed.registry.as(nowakId).bell()).entries).toEqual([]);
  });

  it("nie pozwala odebrać wejścia do roli następnym oglądającym", async () => {
    await demo();
    const [owner, manager] = await bed.registry.system().demoAccounts();
    const registry = bed.registry.as(owner.userId);

    for (const attempt of [registry.deactivateMember(manager.userId), registry.resetMemberPassword(manager.userId)]) {
      const error = await attempt.catch((caught: unknown) => caught);
      expect(isRegistryError(error) && error.code).toBe("demo_locked");
    }
  });

  it("czat z supportem i push są wyłączone, bo konto roli dzielą wszyscy oglądający", async () => {
    await demo();
    const [, manager] = await bed.registry.system().demoAccounts();
    const registry = bed.registry.as(manager.userId);

    await expect(registry.sendSupportMessage({ operationId: randomUUID(), text: "Mój numer: 600 100 200" })).rejects.toMatchObject({
      code: "demo_chat",
    });
    await expect(registry.supportChat()).rejects.toMatchObject({ code: "demo_chat" });
    expect(await registry.unreadSupportReplyCount()).toBe(0);
    await expect(
      registry.subscribeToPush({ endpoint: "https://fcm.googleapis.com/fcm/send/demo", keys: { p256dh: "klucz", auth: "sekret" } }),
    ).rejects.toMatchObject({ code: "demo_push" });
    expect(bed.notifier.supportEmails).toEqual([]);
  });

  it("subskrypcja push konta demo sprzed wyłączenia push nie dostaje kopii wpisów dzwonka", async () => {
    const { companyId } = await demo();
    const [, marek, anna] = await bed.registry.system().demoAccounts();
    await bed.db.transaction((sql) =>
      sql("insert into app.push_subscriptions (endpoint, company_id, user_id, p256dh, auth, created_at) values ($1, $2, $3, 'klucz', 'sekret', $4)", [
        "https://fcm.googleapis.com/fcm/send/marek",
        companyId,
        marek.userId,
        START,
      ]),
    );
    // Anna zabiera sprzęt z budowy Marka: Marek ma wpis w dzwonku, ale bez kopii na telefon.
    const { sites } = await bed.registry.as(anna.userId).whereIsWhat();
    const tarasy = sites.find((site) => site.manager.id === marek.userId && site.tools.length > 0)!;
    const annas = sites.find((site) => site.manager.id === anna.userId)!;
    const unread = await bed.registry.as(marek.userId).unreadNotificationCount();
    await bed.registry.as(anna.userId).registerMovement({
      operationId: randomUUID(),
      kind: "przeniesienie",
      fromLocationId: tarasy.id,
      toLocationId: annas.id,
      toolIds: [tarasy.tools[0].id],
      source: "checklista",
    });

    expect(await bed.registry.as(marek.userId).unreadNotificationCount()).toBe(unread + 1);
    expect(bed.notifier.pushed).toEqual([]);
  });

  it("nowe demo zastępuje poprzednie, które znika w całości: dane, historia, konta i pliki", async () => {
    const { companyId: previousId } = await demo();
    const previous = await bed.registry.system().demoAccounts();
    const [previousOwner, , , , , previousWorker] = previous;
    // Oglądający zostawił w demo zgłoszenie ze zdjęciem i komentarz (wątek zgłoszenia tylko się dopisuje).
    const { issueId } = await bed.registry.as(previousWorker.userId).fileIssue({
      operationId: randomUUID(),
      kind: "inne",
      description: "Brakuje przedłużacza",
      photo: jpeg(),
    });
    await bed.registry.as(previousOwner.userId).commentOnIssue({ operationId: randomUUID(), issueId, text: "Sprawdzę w bazie" });
    const zawbud = await bed.givenActiveCompany("Zawbud");
    expect(bed.photos.photos.size).toBeGreaterThan(0);

    const { companyId, purged } = await demo(new Date(START.getTime() + 60_000));

    expect(purged).toBe(1);
    const accounts = await bed.registry.system().demoAccounts();
    expect(accounts).toHaveLength(9);
    expect(await bed.registry.as(accounts[0].userId).session()).toMatchObject({ company: { id: companyId } });
    expect(await bed.registry.as(previousOwner.userId).session()).toBeNull();
    expect(await rowsOfCompany(previousId)).toEqual([]);
    expect(await bed.db.transaction((sql) => sql("select id from auth.users where id = any($1)", [previous.map((account) => account.userId)]))).toEqual([]);
    expect(bed.photos.photos.size).toBe(0);
    // Zwykła firma zostaje bez zmian.
    expect(await bed.registry.as(zawbud.ownerId).session()).toMatchObject({ company: { id: zawbud.companyId } });
    expect(await rowsOfCompany(zawbud.companyId)).not.toEqual([]);
  });

  it("historii zwykłej firmy ani obecnego demo nie da się usunąć", async () => {
    const zawbud = await bed.givenActiveCompany("Zawbud");
    const nowakId = await bed.givenMember(zawbud, "kierownik", "Adam Nowak");
    const registry = bed.registry.as(zawbud.ownerId);
    const { locationId: siteId } = await registry.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    const category = await registry.addCategory({ name: "Szlifierki", prefix: "S" });
    const { toolId } = await registry.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka", categoryId: category.id });
    const { base } = await registry.whereIsWhat();
    await registry.registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: base.id, toLocationId: siteId, toolIds: [toolId], source: "checklista" });
    const { companyId } = await demo();

    for (const id of [companyId, zawbud.companyId]) {
      await expect(bed.db.transaction((sql) => sql("delete from app.movements where company_id = $1", [id]))).rejects.toThrow(
        /tylko się dopisuje/,
      );
    }
  });

  it("konto usuniętego demo, do którego ktoś wszedł, dalej wraca na stronę demo", async () => {
    await demo();
    const [previousOwner] = await bed.registry.system().demoAccounts();
    await bed.registry.system().recordDemoEntry({ ...entry(previousOwner.userId), sessionId: randomUUID() });
    await demo(new Date(START.getTime() + 60_000));

    expect(await bed.registry.system().isDemoAccount(previousOwner.userId)).toBe(true);
  });

  it("zadanie godzinowe nie zmienia demo, do którego nikt nie wszedł", async () => {
    const { companyId } = await demo();

    expect(await refresh(minutesAfterStart(5 * 60))).toEqual({ refreshed: false, reason: "unused" });
    expect(await currentDemoCompany()).toBe(companyId);
  });

  it("zadanie godzinowe odświeża demo pół godziny po ostatnim wejściu, a nie w trakcie oglądania", async () => {
    const { companyId } = await demo();
    const [owner, manager] = await bed.registry.system().demoAccounts();
    await enter(owner.userId, minutesAfterStart(10));
    // Przełączenie roli paskiem demo to kolejne wejście.
    await enter(manager.userId, minutesAfterStart(25));

    expect(await refresh(minutesAfterStart(50))).toEqual({ refreshed: false, reason: "in_use" });
    expect(await currentDemoCompany()).toBe(companyId);

    const refreshed = await refresh(minutesAfterStart(56));
    expect(refreshed).toEqual({ refreshed: true, companyId: expect.any(String), purged: 1 });
    expect(await currentDemoCompany()).not.toBe(companyId);
    expect(await bed.registry.as(manager.userId).session()).toBeNull();
    expect(await bed.registry.system().demoUse()).toEqual({ lastEntryAt: null });
  });

  it("zadanie godzinowe zakłada demo, gdy go jeszcze nie ma", async () => {
    expect(await refresh(START)).toEqual({ refreshed: true, companyId: expect.any(String), purged: 0 });
    expect(await bed.registry.system().demoAccounts()).toHaveLength(9);
  });

  it("bez firmy demo nie ma kont demo", async () => {
    const zawbud = await bed.givenActiveCompany("Zawbud");
    expect(await bed.registry.system().demoAccounts()).toEqual([]);
    expect(await bed.registry.system().isDemoAccount(zawbud.ownerId)).toBe(false);
    expect(await bed.registry.system().demoUse()).toBeNull();
  });
});

describe("dziennik demo", () => {
  const visits = async () => bed.registry.superAdmin(await bed.givenSuperAdmin()).demoVisits();

  it("pokazuje super-adminowi wizytę: wejście, przełączenie roli, ekrany i akcje, z rolą i urządzeniem", async () => {
    await demo();
    const [owner, manager] = await bed.registry.system().demoAccounts();
    const system = bed.registry.system();
    const first = randomUUID();
    const second = randomUUID();
    bed.clock.set(minutesAfterStart(1));
    await system.recordDemoEntry({ userId: owner.userId, sessionId: first, previousSessionId: null, switched: false, device: "telefon" });
    bed.clock.set(minutesAfterStart(2));
    await system.recordDemoPage({ userId: owner.userId, sessionId: first, path: "/historia" });
    bed.clock.set(minutesAfterStart(3));
    await system.recordDemoEntry({ userId: manager.userId, sessionId: second, previousSessionId: first, switched: true, device: "telefon" });
    bed.clock.set(minutesAfterStart(4));
    await bed.registry.as(manager.userId).fileIssue({ operationId: randomUUID(), kind: "inne", description: "Brakuje przedłużacza" });
    // Zapytanie to nie akcja.
    await bed.registry.as(manager.userId).issues();

    expect(await visits()).toEqual([
      {
        id: expect.any(String),
        startedAt: minutesAfterStart(1),
        lastSeenAt: minutesAfterStart(4),
        device: "telefon",
        roles: ["wlasciciel", "kierownik"],
        pageCount: 1,
        actionCount: 1,
        events: [
          { at: minutesAfterStart(1), role: "wlasciciel", kind: "wejscie", detail: "demo" },
          { at: minutesAfterStart(2), role: "wlasciciel", kind: "strona", detail: "/historia" },
          { at: minutesAfterStart(3), role: "kierownik", kind: "wejscie", detail: "pasek" },
          { at: minutesAfterStart(4), role: "kierownik", kind: "akcja", detail: "fileIssue" },
        ],
      },
    ]);
  });

  it("dwie przeglądarki to dwie wizyty, od najnowszej", async () => {
    await demo();
    const [owner, manager] = await bed.registry.system().demoAccounts();
    bed.clock.set(minutesAfterStart(1));
    await bed.registry.system().recordDemoEntry(entry(owner.userId));
    bed.clock.set(minutesAfterStart(2));
    await bed.registry.system().recordDemoEntry(entry(manager.userId));

    expect((await visits()).map((visit) => visit.roles)).toEqual([["kierownik"], ["wlasciciel"]]);
  });

  it("zostaje po usunięciu demo, a nic nie zapisuje o zwykłej firmie", async () => {
    await demo();
    const [owner] = await bed.registry.system().demoAccounts();
    await bed.registry.system().recordDemoEntry(entry(owner.userId));
    await demo(new Date(START.getTime() + 60_000));
    const zawbud = await bed.givenActiveCompany("Zawbud");
    await bed.registry.system().recordDemoEntry(entry(zawbud.ownerId));
    await bed.registry.system().recordDemoPage({ userId: zawbud.ownerId, sessionId: null, path: "/" });
    await bed.registry.as(zawbud.ownerId).addCategory({ name: "Szlifierki", prefix: "S" });

    expect((await visits()).map((visit) => visit.events.map((event) => event.kind))).toEqual([["wejscie"]]);
  });

  it("widzi go tylko super-admin", async () => {
    await demo();
    const [owner] = await bed.registry.system().demoAccounts();

    await expect(bed.registry.superAdmin(owner.userId).demoVisits()).rejects.toMatchObject({ code: "forbidden" });
    expect(await bed.db.transaction((sql) => withActorRows(sql, owner.userId))).toEqual([]);
  });
});

/** Wiersze dziennika widziane przez RLS jako ten użytkownik. */
async function withActorRows(sql: Parameters<Parameters<typeof bed.db.transaction>[0]>[0], userId: string) {
  await sql("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await sql("set local role authenticated");
  return sql("select id from app.demo_events");
}
