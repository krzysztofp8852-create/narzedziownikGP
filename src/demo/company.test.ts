import { describe, expect, it } from "vitest";
import { isRegistryError } from "@/registry/errors";
import { setupRegistryTestbed, START } from "@/registry/testing/harness";
import { createDemoCompany, DEMO_COMPANY_NAME } from "./company";

const bed = setupRegistryTestbed();

const demo = (now = START) =>
  createDemoCompany({ db: bed.db, authAdmin: bed.auth, photos: bed.photos, chatPhotos: bed.chatPhotos }, { now });

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

    const marek = bed.registry.as(manager.userId);
    expect(await marek.movementsToClarify()).toHaveLength(1);
    expect(await marek.unreadNotificationCount()).toBeGreaterThan(0);
    expect((await bed.registry.as(storekeeper.userId).recentMovements()).length).toBeGreaterThan(5);
    expect(await bed.registry.as(worker.userId).issues()).toHaveLength(1);
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

  it("nowe demo zastępuje poprzednie: stare konta tracą dostęp", async () => {
    await demo();
    const [previousOwner] = await bed.registry.system().demoAccounts();
    const { companyId } = await demo(new Date(START.getTime() + 60_000));

    const accounts = await bed.registry.system().demoAccounts();
    expect(accounts).toHaveLength(9);
    expect(await bed.registry.as(accounts[0].userId).session()).toMatchObject({ company: { id: companyId } });
    expect(await bed.registry.as(previousOwner.userId).session()).toBeNull();
    expect(await bed.registry.system().isDemoAccount(previousOwner.userId)).toBe(true);
  });

  it("bez firmy demo nie ma kont demo", async () => {
    const zawbud = await bed.givenActiveCompany("Zawbud");
    expect(await bed.registry.system().demoAccounts()).toEqual([]);
    expect(await bed.registry.system().isDemoAccount(zawbud.ownerId)).toBe(false);
  });
});
