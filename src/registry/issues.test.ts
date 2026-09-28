import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { FileIssueInput, RegisteredKind } from "./registry";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Zawbud: kierownicy Nowak (Rataje) i Kowalski (Winogrady), magazynier Wiśniewski, pracownik Zieliński.
 * Wiertarka W-02 jest na Ratajach, szlifierka S-01 na bazie; jest też serwis Hilti.
 */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const ownerId = zawbud.ownerId;
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Piotr Wiśniewski");
  const workerId = await testbed.givenMember(zawbud, "pracownik", "Marek Zieliński");
  const owner = testbed.registry.as(ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const { locationId: serviceId } = await owner.addService({ name: "Serwis Hilti" });
  const drills = await owner.addCategory({ name: "Wiertarki", prefix: "W" });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  await owner.addTool({ operationId: randomUUID(), code: "W-01", name: "Wiertarka Bosch", categoryId: drills.id });
  const w02 = (await owner.addTool({ operationId: randomUUID(), code: "W-02", name: "Wiertarka Makita", categoryId: drills.id })).toolId;
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  await move(nowakId, "wydanie", base.id, ratajeId, [w02]);
  return { zawbud, owner, ownerId, nowakId, kowalskiId, storekeeperId, workerId, ratajeId, winogradyId, serviceId, baseId: base.id, w02, s01 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[]) {
  return testbed.registry
    .as(actorId)
    .registerMovement({ operationId: randomUUID(), kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

function fileIssue(actorId: string, input: Omit<FileIssueInput, "operationId"> & { operationId?: string }) {
  return testbed.registry.as(actorId).fileIssue({ operationId: randomUUID(), ...input });
}

function comment(actorId: string, issueId: string, text: string) {
  return testbed.registry.as(actorId).commentOnIssue({ operationId: randomUUID(), issueId, text });
}

function close(actorId: string, issueId: string, text: string, toolWorking?: boolean) {
  return testbed.registry.as(actorId).closeIssue({ operationId: randomUUID(), issueId, comment: text, toolWorking });
}

async function toolOnBoard(actorId: string, toolId: string) {
  const board = await testbed.registry.as(actorId).whereIsWhat();
  return [board.base, ...board.sites, ...board.vehicles, ...board.services].flatMap((place) => place.tools).find((tool) => tool.id === toolId);
}

async function issueIds(actorId: string) {
  return (await testbed.registry.as(actorId).issues()).map((issue) => issue.id);
}

function jpeg(bytes = 1000) {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(bytes).fill(1)])], { type: "image/jpeg" });
}

describe("zgłoszenie uszkodzenia", () => {
  it("pracownik zgłasza uszkodzenie W-02: narzędzie jest uszkodzone od tej chwili, a ruchy działają dalej", async () => {
    const z = await givenZawbud();

    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Nie trzyma udaru, iskrzy" });

    const issue = await z.owner.issue(issueId);
    expect(issue).toMatchObject({
      kind: "uszkodzenie",
      status: "otwarte",
      description: "Nie trzyma udaru, iskrzy",
      tool: { id: z.w02, code: "W-02", name: "Wiertarka Makita" },
      location: { id: z.ratajeId, name: "Rataje" },
      author: "Marek Zieliński",
      createdAt: testbed.clock.now(),
      photo: false,
      thread: [],
    });
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: testbed.clock.now() });
    expect(await z.owner.toolCard(z.w02)).toMatchObject({ damagedSince: testbed.clock.now(), state: "w_obiegu" });

    const movement = await move(z.nowakId, "zwrot", z.ratajeId, z.baseId, [z.w02]);
    expect(movement.to).toEqual({ id: z.baseId, name: "Magazyn Swarzędz" });
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: expect.any(Date) });
  });

  it("uszkodzenie wymaga narzędzia w obiegu; drugie zgłoszenie zostawia datę pierwszego", async () => {
    const z = await givenZawbud();
    await expect(fileIssue(z.nowakId, { kind: "uszkodzenie", description: "Coś się zepsuło" })).rejects.toMatchObject({ code: "tool_required" });
    await expect(fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: randomUUID(), description: "Zepsute" })).rejects.toMatchObject({
      code: "not_found",
    });
    const first = testbed.clock.now();
    await fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });
    testbed.clock.advance(DAY);

    await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Dalej iskrzy" });

    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: first });
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.s01, reason: "sprzedana" });
    await expect(fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: z.s01, description: "Zepsuta" })).rejects.toMatchObject({
      code: "invalid_tool_state",
    });
  });

  it("ruch z serwisu zdejmuje flagę, a ruch do serwisu nie", async () => {
    const z = await givenZawbud();
    await fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    await move(z.nowakId, "do_serwisu", z.ratajeId, z.serviceId, [z.w02]);
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: expect.any(Date) });

    await move(z.storekeeperId, "z_serwisu", z.serviceId, z.baseId, [z.w02]);
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: null });
    expect(await z.owner.toolCard(z.w02)).toMatchObject({ damagedSince: null });
  });

  it("właściciel zamyka zgłoszenie z oceną „sprawne”: flaga znika; zamknięcie bez tej oceny ją zostawia", async () => {
    const z = await givenZawbud();
    const { issueId: first } = await fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });
    const { issueId: second } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Nie kręci" });

    await close(z.ownerId, first, "Zamawiam serwis, to zgłoszenie dubluje drugie");
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: expect.any(Date) });

    await close(z.ownerId, second, "Sprawdziłem, szczotki były brudne. Działa.", true);
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: null });
    expect(await z.owner.issue(second)).toMatchObject({ status: "zamkniete", toolWorking: true, closedBy: expect.stringContaining("Właściciel") });
  });

  it("za sprawne uznaje narzędzie tylko właściciel i tylko przy zgłoszeniu uszkodzenia", async () => {
    const z = await givenZawbud();
    await z.owner.updateSettings({ issueVisibility: { siteManagers: true, storekeepers: true, storekeepersClose: true } });
    const { issueId } = await fileIssue(z.nowakId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });
    const { issueId: other } = await fileIssue(z.nowakId, { kind: "inne", description: "Brakuje przedłużacza" });

    await expect(close(z.storekeeperId, issueId, "Działa", true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(close(z.ownerId, other, "Kupione", true)).rejects.toMatchObject({ code: "invalid_input" });

    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: expect.any(Date) });
    expect(await z.owner.issue(issueId)).toMatchObject({ status: "otwarte" });
  });
});

describe("zgłoszenie braku i innej sprawy", () => {
  it("brak / zaginięcie nie zmienia stanu narzędzia ani nie daje flagi", async () => {
    const z = await givenZawbud();

    const { issueId } = await fileIssue(z.nowakId, { kind: "brak", toolId: z.w02, description: "Nie ma jej od piątku" });

    expect(await z.owner.toolCard(z.w02)).toMatchObject({ state: "w_obiegu", damagedSince: null, location: { id: z.ratajeId } });
    expect(await toolOnBoard(z.ownerId, z.w02)).toMatchObject({ damagedSince: null });
    expect(await z.owner.issue(issueId)).toMatchObject({ kind: "brak", tool: { code: "W-02" }, location: { name: "Rataje" } });
  });

  it("inne i brak mogą dotyczyć lokalizacji albo niczego", async () => {
    const z = await givenZawbud();

    const { issueId: site } = await fileIssue(z.workerId, { kind: "inne", locationId: z.winogradyId, description: "Kontener się nie zamyka" });
    const { issueId: nothing } = await fileIssue(z.workerId, { kind: "brak", description: "Brakuje kasków" });

    expect(await z.owner.issue(site)).toMatchObject({ kind: "inne", tool: null, location: { id: z.winogradyId, name: "Winogrady" } });
    expect(await z.owner.issue(nothing)).toMatchObject({ kind: "brak", tool: null, location: null });
    await expect(fileIssue(z.workerId, { kind: "inne", locationId: randomUUID(), description: "?" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("zgłoszenie składa każda rola; opis jest obowiązkowy, a rodzaj z listy", async () => {
    const z = await givenZawbud();
    for (const actorId of [z.ownerId, z.storekeeperId, z.nowakId, z.workerId]) {
      await expect(fileIssue(actorId, { kind: "inne", description: "Brudna toaleta na bazie" })).resolves.toEqual({ issueId: expect.any(String) });
    }
    await expect(fileIssue(z.workerId, { kind: "inne", description: "   " })).rejects.toMatchObject({ code: "description_required" });
    await expect(fileIssue(z.workerId, { kind: "reklamacja" as never, description: "?" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("ponowne wysłanie tej samej operacji zwraca to samo zgłoszenie", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();

    const first = await fileIssue(z.workerId, { operationId, kind: "inne", description: "Brakuje kasków" });
    const again = await fileIssue(z.workerId, { operationId, kind: "inne", description: "Brakuje kasków" });

    expect(again).toEqual(first);
    expect(await issueIds(z.ownerId)).toEqual([first.issueId]);
  });
});

describe("widoczność zgłoszeń", () => {
  it("domyślnie: właściciel, magazynier i kierownik lokalizacji widzą zgłoszenie, a inny kierownik nie", async () => {
    const z = await givenZawbud();
    expect((await z.owner.settings()).issueVisibility).toEqual({ siteManagers: true, storekeepers: true, storekeepersClose: false });

    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    for (const viewer of [z.ownerId, z.storekeeperId, z.nowakId, z.workerId]) expect(await issueIds(viewer)).toEqual([issueId]);
    expect(await issueIds(z.kowalskiId)).toEqual([]);
    expect(await testbed.registry.as(z.kowalskiId).issue(issueId)).toBeNull();
  });

  it("bez przełączników zgłoszenia widzą tylko właściciel i autor", async () => {
    const z = await givenZawbud();
    await z.owner.updateSettings({ issueVisibility: { siteManagers: false, storekeepers: false, storekeepersClose: false } });

    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });
    const { issueId: own } = await fileIssue(z.storekeeperId, { kind: "inne", description: "Regał się chwieje" });

    expect(await issueIds(z.ownerId)).toEqual([own, issueId]);
    expect(await issueIds(z.workerId)).toEqual([issueId]);
    expect(await issueIds(z.storekeeperId)).toEqual([own]);
    expect(await issueIds(z.nowakId)).toEqual([]);
  });

  it("pracownik nie widzi cudzych zgłoszeń, a inna firma żadnych", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const colleagueId = await testbed.givenMember(z.zawbud, "pracownik", "Ewa Lis");
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });

    expect(await issueIds(colleagueId)).toEqual([]);
    expect(await issueIds(budrex.ownerId)).toEqual([]);
    expect(await testbed.registry.as(budrex.ownerId).issue(issueId)).toBeNull();
    await expect(comment(budrex.ownerId, issueId, "Hej")).rejects.toMatchObject({ code: "not_found" });
  });

  it("połączenie z bazą jako kierownik innej budowy nie czyta zgłoszenia", async () => {
    const z = await givenZawbud();
    await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    const rows = await withActor(testbed.db, z.kowalskiId, (sql) => sql("select id from app.issues"));

    expect(rows).toEqual([]);
  });

  it("lista: otwarte przed zamkniętymi, w każdej grupie od najnowszego, z liczbą komentarzy", async () => {
    const z = await givenZawbud();
    const { issueId: old } = await fileIssue(z.workerId, { kind: "inne", description: "Stare" });
    testbed.clock.advance(DAY);
    const { issueId: closed } = await fileIssue(z.workerId, { kind: "inne", description: "Załatwione" });
    await close(z.ownerId, closed, "Zrobione");
    testbed.clock.advance(DAY);
    const { issueId: fresh } = await fileIssue(z.workerId, { kind: "brak", description: "Nowe" });

    const list = await z.owner.issues();

    expect(list.map((issue) => issue.id)).toEqual([fresh, old, closed]);
    expect(list.find((issue) => issue.id === closed)).toMatchObject({ status: "zamkniete", comments: 1 });
  });
});

describe("wątek i zamykanie", () => {
  it("kto widzi zgłoszenie, ten komentuje; wątek idzie po kolei i tylko się dopisuje", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    await comment(z.nowakId, issueId, "Odłożyłem ją do kontenera");
    testbed.clock.advance(60_000);
    await comment(z.ownerId, issueId, "Jutro zabieram do serwisu");

    expect((await testbed.registry.as(z.workerId).issue(issueId))?.thread).toEqual([
      { id: expect.any(String), author: "Adam Nowak", text: "Odłożyłem ją do kontenera", createdAt: expect.any(Date), closes: false },
      { id: expect.any(String), author: "Właściciel Zawbud", text: "Jutro zabieram do serwisu", createdAt: expect.any(Date), closes: false },
    ]);
    await expect(comment(z.kowalskiId, issueId, "A u mnie?")).rejects.toMatchObject({ code: "not_found" });
    await expect(comment(z.nowakId, issueId, "  ")).rejects.toMatchObject({ code: "comment_required" });
    await expect(
      withActor(testbed.db, z.nowakId, (sql) => sql("update app.issue_comments set body = 'zmienione'")),
    ).rejects.toThrow();
  });

  it("ponowne wysłanie komentarza nie dubluje go", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });
    const operationId = randomUUID();

    await z.owner.commentOnIssue({ operationId, issueId, text: "Zamówione" });
    await z.owner.commentOnIssue({ operationId, issueId, text: "Zamówione" });

    expect((await z.owner.issue(issueId))?.thread).toHaveLength(1);
  });

  it("zamknięcie wymaga komentarza; zamkniętego nie da się komentować ani zamknąć drugi raz", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });

    await expect(close(z.ownerId, issueId, " ")).rejects.toMatchObject({ code: "comment_required" });
    await close(z.ownerId, issueId, "Kupione, są w kontenerze");

    expect(await z.owner.issue(issueId)).toMatchObject({
      status: "zamkniete",
      closedAt: testbed.clock.now(),
      closedBy: "Właściciel Zawbud",
      canComment: false,
      canClose: false,
      thread: [expect.objectContaining({ text: "Kupione, są w kontenerze", closes: true })],
    });
    await expect(comment(z.workerId, issueId, "Dzięki")).rejects.toMatchObject({ code: "issue_closed" });
    await expect(close(z.ownerId, issueId, "Jeszcze raz")).rejects.toMatchObject({ code: "issue_closed" });
  });

  it("kierownik i autor-pracownik nie zamykają; magazynier zamyka tylko ze zgodą właściciela", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    for (const actorId of [z.nowakId, z.workerId, z.storekeeperId]) {
      await expect(close(actorId, issueId, "Załatwione")).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await testbed.registry.as(z.storekeeperId).issue(issueId)).toMatchObject({ canComment: true, canClose: false });
    expect(await testbed.registry.as(z.nowakId).issue(issueId)).toMatchObject({ canComment: true, canClose: false });

    await z.owner.updateSettings({ issueVisibility: { siteManagers: true, storekeepers: true, storekeepersClose: true } });
    expect(await testbed.registry.as(z.storekeeperId).issue(issueId)).toMatchObject({ canClose: true, canMarkToolWorking: false });
    await close(z.storekeeperId, issueId, "Wysłana do serwisu");

    expect(await z.owner.issue(issueId)).toMatchObject({ status: "zamkniete", closedBy: "Piotr Wiśniewski", toolWorking: null });
  });

  it("połączenie z bazą jako kierownik nie zamyka zgłoszenia", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });

    await withActor(testbed.db, z.nowakId, (sql) =>
      sql("update app.issues set status = 'zamkniete', closed_at = now(), closed_by = $1", [z.nowakId]),
    ).catch(() => null);

    expect(await z.owner.issue(issueId)).toMatchObject({ status: "otwarte" });
  });
});

describe("zdjęcie zgłoszenia", () => {
  it("zdjęcie zapisuje się w kubełku i widzi je tylko ten, kto widzi zgłoszenie", async () => {
    const z = await givenZawbud();
    const photo = jpeg();

    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Pęknięta obudowa", photo });

    expect(await z.owner.issue(issueId)).toMatchObject({ photo: true });
    const read = await z.owner.issuePhoto(issueId);
    expect(read?.type).toBe("image/jpeg");
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(new Uint8Array(await photo.arrayBuffer()));
    expect(await testbed.registry.as(z.kowalskiId).issuePhoto(issueId)).toBeNull();
    expect([...testbed.photos.photos.keys()]).toEqual([expect.stringContaining(z.zawbud.companyId)]);
  });

  it("przyjmuje tylko zdjęcia JPG, PNG i WEBP do 4 MB", async () => {
    const z = await givenZawbud();
    const invalid = [
      new Blob(["to nie zdjęcie"], { type: "text/plain" }),
      new Blob(["udaję jpg"], { type: "image/jpeg" }),
      jpeg(4 * 1024 * 1024),
      new Blob([], { type: "image/png" }),
    ];
    for (const photo of invalid) {
      await expect(fileIssue(z.workerId, { kind: "inne", description: "Zdjęcie", photo })).rejects.toMatchObject({ code: "photo_invalid" });
    }
    expect(testbed.photos.photos.size).toBe(0);
    expect(await issueIds(z.ownerId)).toEqual([]);
  });

  it("ponowienie z tym samym zdjęciem nie zapisuje go drugi raz", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();

    await fileIssue(z.workerId, { operationId, kind: "inne", description: "Kontener", photo: jpeg() });
    await fileIssue(z.workerId, { operationId, kind: "inne", description: "Kontener", photo: jpeg() });

    expect(testbed.photos.photos.size).toBe(1);
  });
});

describe("okno 📋: wpisy i licznik", () => {
  it("nowe zgłoszenie trafia do okna każdego, kto je widzi, poza autorem", async () => {
    const z = await givenZawbud();

    const { issueId } = await fileIssue(z.workerId, { kind: "uszkodzenie", toolId: z.w02, description: "Iskrzy" });

    for (const viewer of [z.ownerId, z.storekeeperId, z.nowakId]) {
      expect(await testbed.registry.as(viewer).unreadIssueEntryCount()).toBe(1);
      expect(await testbed.registry.as(viewer).issues()).toEqual([expect.objectContaining({ id: issueId, unread: 1 })]);
    }
    expect(await testbed.registry.as(z.workerId).unreadIssueEntryCount()).toBe(0);
    expect(await testbed.registry.as(z.kowalskiId).unreadIssueEntryCount()).toBe(0);
  });

  it("komentarze i zamknięcie trafiają też do autora; otwarcie zgłoszenia czyta jego wpisy", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });
    const worker = testbed.registry.as(z.workerId);

    await comment(z.ownerId, issueId, "Zamówione");
    await close(z.ownerId, issueId, "Są w kontenerze");

    expect(await worker.unreadIssueEntryCount()).toBe(2);
    await worker.markIssueRead(issueId);
    expect(await worker.unreadIssueEntryCount()).toBe(0);
    expect(await worker.issues()).toEqual([expect.objectContaining({ id: issueId, unread: 0 })]);
    // Właściciel ma jeszcze nieprzeczytane samo zgłoszenie; jego komentarze nie są dla niego nowe.
    expect(await z.owner.unreadIssueEntryCount()).toBe(1);
  });

  it("zgłoszenie narzędzia z budowy trafia do okna właściciela i znika z licznika po decyzji", async () => {
    const z = await givenZawbud();
    const [category] = await z.owner.categories();
    const { toolId } = await testbed.registry
      .as(z.nowakId)
      .reportTool({ operationId: randomUUID(), siteId: z.ratajeId, name: "Młot Hilti", categoryId: category.id });

    expect(await z.owner.unreadIssueEntryCount()).toBe(1);
    expect(await testbed.registry.as(z.storekeeperId).unreadIssueEntryCount()).toBe(0);

    await z.owner.acceptToolReport({ toolId, value: 3200 });
    expect(await z.owner.unreadIssueEntryCount()).toBe(0);
  });

  it("„oznacz wszystkie jako przeczytane” zeruje licznik", async () => {
    const z = await givenZawbud();
    await fileIssue(z.workerId, { kind: "inne", description: "Jedno" });
    await fileIssue(z.nowakId, { kind: "inne", description: "Drugie" });

    await z.owner.markAllIssueEntriesRead();

    expect(await z.owner.unreadIssueEntryCount()).toBe(0);
  });

  it("wpisy zgłoszenia, którego adresat już nie widzi, nie liczą się", async () => {
    const z = await givenZawbud();
    await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });
    expect(await testbed.registry.as(z.storekeeperId).unreadIssueEntryCount()).toBe(1);

    await z.owner.updateSettings({ issueVisibility: { siteManagers: true, storekeepers: false, storekeepersClose: false } });

    expect(await testbed.registry.as(z.storekeeperId).unreadIssueEntryCount()).toBe(0);
  });
});

describe("ustawienie „Kto widzi zgłoszenia”", () => {
  it("zmienia tylko właściciel; zamykanie przez magazyniera wymaga, żeby widział zgłoszenia", async () => {
    const z = await givenZawbud();
    const visibility = { siteManagers: false, storekeepers: true, storekeepersClose: true };

    await z.owner.updateSettings({ issueVisibility: visibility });

    expect(await z.owner.settings()).toEqual({ alarmThresholdDays: 30, issueVisibility: visibility });
    await expect(
      z.owner.updateSettings({ issueVisibility: { siteManagers: true, storekeepers: false, storekeepersClose: true } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      testbed.registry.as(z.storekeeperId).updateSettings({ issueVisibility: { siteManagers: true, storekeepers: true, storekeepersClose: true } }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("zgłoszenia w trybie tylko do odczytu", () => {
  it("nie da się złożyć, skomentować ani zamknąć zgłoszenia, ale okno działa", async () => {
    const z = await givenZawbud();
    const { issueId } = await fileIssue(z.workerId, { kind: "inne", description: "Brakuje kasków" });
    const superAdminId = await testbed.givenSuperAdmin();
    await testbed.registry.superAdmin(superAdminId).setManualReadOnly(z.zawbud.companyId, true);

    await expect(fileIssue(z.workerId, { kind: "inne", description: "Jeszcze jedno" })).rejects.toMatchObject({ code: "read_only" });
    await expect(comment(z.ownerId, issueId, "Zamówione")).rejects.toMatchObject({ code: "read_only" });
    await expect(close(z.ownerId, issueId, "Zrobione")).rejects.toMatchObject({ code: "read_only" });

    expect(await issueIds(z.ownerId)).toEqual([issueId]);
    await z.owner.markIssueRead(issueId);
    expect(await z.owner.unreadIssueEntryCount()).toBe(0);
  });
});
