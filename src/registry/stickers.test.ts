import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { StickerBatch } from "./registry";
import { setupRegistryTestbed, START } from "./testing/harness";

const testbed = setupRegistryTestbed();
/** „Wydruk”, który oddaje dane naklejek, żeby test je sprawdził. */
const asIs = async (batch: StickerBatch) => batch;

/** Zawbud z magazynierem i narzędziami na bazie: młot H-01 i szlifierki S-01, S-02. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const storekeeperId = await testbed.givenMember(zawbud, "magazynier", "Ewa Magazyn");
  const owner = testbed.registry.as(zawbud.ownerId);
  const category = await owner.addCategory({ name: "Elektronarzędzia", prefix: "E" });
  const tool = async (code: string, name: string) =>
    (await owner.addTool({ operationId: randomUUID(), code, name, categoryId: category.id })).toolId;
  const h01 = await tool("H-01", "Młot Hilti");
  const s01 = await tool("S-01", "Szlifierka kątowa");
  const s02 = await tool("S-02", "Szlifierka mała");
  return { zawbud, owner, storekeeperId, categoryId: category.id, h01, s01, s02 };
}

describe("naklejki QR", () => {
  it("właściciel drukuje naklejki wybranych narzędzi: kod, identyfikator do adresu i nazwa firmy", async () => {
    const z = await givenZawbud();

    const batch = await z.owner.printStickers({ toolIds: [z.s01, z.h01] }, asIs);

    expect(batch).toEqual({
      companyName: "Zawbud",
      printedAt: START,
      stickers: [
        { toolId: z.h01, code: "H-01" },
        { toolId: z.s01, code: "S-01" },
      ],
    });
  });

  it("„wszystkie nieoklejone” to narzędzia, którym nigdy nie drukowano naklejki; po druku już nimi nie są", async () => {
    const z = await givenZawbud();
    await z.owner.printStickers({ toolIds: [z.s01] }, asIs);

    const first = await z.owner.printStickers({ unlabeled: true }, asIs);
    expect(first.stickers.map((sticker) => sticker.code)).toEqual(["H-01", "S-02"]);

    await expect(z.owner.printStickers({ unlabeled: true }, asIs)).rejects.toMatchObject({ code: "no_stickers" });
  });

  it("druk zapisuje się dopiero wtedy, gdy powstał plik: nieudany PDF zostawia narzędzia nieoklejone", async () => {
    const z = await givenZawbud();

    await expect(
      z.owner.printStickers({ unlabeled: true }, async () => {
        throw new Error("brak czcionki");
      }),
    ).rejects.toThrow("brak czcionki");

    const printed = await z.owner.printStickers({ unlabeled: true }, async (batch) => batch.stickers.length);
    expect(printed).toBe(3);
  });

  it("zmiana kodu unieważnia naklejkę: narzędzie znów jest nieoklejone", async () => {
    const z = await givenZawbud();
    await z.owner.printStickers({ unlabeled: true }, async () => null);

    await testbed.registry.as(z.storekeeperId).editTool(z.s02, { code: "S-09" });
    await z.owner.editTool(z.h01, { code: "H-01", name: "Młot Hilti TE 30" });

    const batch = await z.owner.printStickers({ unlabeled: true }, async (sheet) => sheet);
    expect(batch.stickers.map((sticker) => sticker.code)).toEqual(["S-09"]);
  });

  it("lista do druku: narzędzia, którym należy się naklejka, z lokalizacją i datą ostatniego druku", async () => {
    const z = await givenZawbud();
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s02, reason: "nie ma go na bazie" });
    testbed.clock.set("2026-03-05T10:00:00+01:00");
    await z.owner.printStickers({ toolIds: [z.s01] }, asIs);

    expect(await z.owner.stickerCandidates()).toEqual([
      { toolId: z.h01, code: "H-01", name: "Młot Hilti", location: "Magazyn Swarzędz", printedAt: null },
      { toolId: z.s01, code: "S-01", name: "Szlifierka kątowa", location: "Magazyn Swarzędz", printedAt: new Date("2026-03-05T10:00:00+01:00") },
    ]);
    await expect(testbed.registry.as(z.storekeeperId).stickerCandidates()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("naklejki drukuje tylko właściciel", async () => {
    const z = await givenZawbud();
    const nowakId = await testbed.givenMember(z.zawbud, "kierownik", "Adam Nowak");

    for (const userId of [z.storekeeperId, nowakId]) {
      await expect(testbed.registry.as(userId).printStickers({ toolIds: [z.h01] }, asIs)).rejects.toMatchObject({ code: "forbidden" });
      await expect(testbed.registry.as(userId).printStickers({ unlabeled: true }, asIs)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect((await z.owner.printStickers({ unlabeled: true }, asIs)).stickers).toHaveLength(3);
  });

  it("identyfikator z naklejki firmy A nic nie mówi firmie B: ani karta narzędzia, ani dodruk", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const budrexOwner = testbed.registry.as(budrex.ownerId);
    const [{ toolId }] = (await z.owner.printStickers({ toolIds: [z.h01] }, asIs)).stickers;

    expect(await budrexOwner.toolCard(toolId)).toBeNull();
    await expect(budrexOwner.printStickers({ toolIds: [toolId] }, asIs)).rejects.toMatchObject({ code: "not_found" });
    await expect(budrexOwner.printStickers({ unlabeled: true }, asIs)).rejects.toMatchObject({ code: "no_stickers" });
  });

  it("naklejki są tylko dla narzędzi zaakceptowanych i w obiegu: bez zgłoszonych, zaginionych i wycofanych", async () => {
    const z = await givenZawbud();
    const nowakId = await testbed.givenMember(z.zawbud, "kierownik", "Adam Nowak");
    const { locationId: ratajeId } = await z.owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
    const reported = await testbed.registry
      .as(nowakId)
      .reportTool({ operationId: randomUUID(), name: "Wkrętarka z Castoramy", categoryId: z.categoryId, siteId: ratajeId });
    await z.owner.markToolLost({ operationId: randomUUID(), toolId: z.s01, reason: "nie ma go na bazie" });
    await z.owner.retireTool({ operationId: randomUUID(), toolId: z.s02, reason: "spalony silnik" });

    const batch = await z.owner.printStickers({ unlabeled: true }, asIs);
    expect(batch.stickers.map((sticker) => sticker.code)).toEqual(["H-01"]);
    for (const toolId of [reported.toolId, z.s01, z.s02]) {
      await expect(z.owner.printStickers({ toolIds: [toolId] }, asIs)).rejects.toMatchObject({ code: "not_found" });
    }
  });
});
