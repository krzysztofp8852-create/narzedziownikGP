import { describe, expect, it } from "vitest";
import { normalizePhone } from "./callback-requests";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function request(phone: string, name = "", source: "o-programie" | "demo" = "o-programie") {
  return testbed.registry.system().requestCallback({ phone, name, source });
}

async function listed() {
  const { requests } = await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).callbackRequests();
  return requests.map(({ phone, name, source }) => [phone, name, source]);
}

describe("numer telefonu z formularza", () => {
  it.each([
    ["600 123 456", "+48600123456"],
    ["600-123-456", "+48600123456"],
    ["+48 600 123 456", "+48600123456"],
    ["0048600123456", "+48600123456"],
    ["48600123456", "+48600123456"],
    ["(+49) 30 1234 5678", "+493012345678"],
  ])("%s to %s", (text, phone) => {
    expect(normalizePhone(text)).toBe(phone);
  });

  it.each(["", "12345", "600 123 45", "jan@zawbud.pl", "+0 600 123 456", "600 123 456 789 012 34"])("„%s” to nie numer", (text) => {
    expect(normalizePhone(text)).toBeNull();
  });
});

describe("prośba o telefon", () => {
  it("zapisuje numer w zapisie międzynarodowym i wysyła e-mail do GP Engineering", async () => {
    await request("600 123 456", "  Jan z Zawbudu ", "demo");

    expect(await listed()).toEqual([["+48600123456", "Jan z Zawbudu", "demo"]]);
    expect(testbed.notifier.callbackEmails).toEqual([
      { id: expect.any(String), at: testbed.clock.now(), phone: "+48600123456", name: "Jan z Zawbudu", source: "demo" },
    ]);
  });

  it("bez imienia; zły numer i za długie imię odrzuca", async () => {
    await request("+48 600 123 456");
    await expect(request("12345")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(request("600 123 457", "x".repeat(101))).rejects.toMatchObject({ code: "invalid_input" });

    expect(await listed()).toEqual([["+48600123456", null, "o-programie"]]);
  });

  it("ten sam numer drugi raz w ciągu doby nic nie zapisuje ani nie wysyła; po dobie znowu", async () => {
    await request("600 123 456");
    testbed.clock.advance(HOUR);
    await request("+48600123456", "Jan");
    testbed.clock.advance(DAY);
    await request("600123456", "Jan");

    expect(await listed()).toEqual([
      ["+48600123456", "Jan", "o-programie"],
      ["+48600123456", null, "o-programie"],
    ]);
    expect(testbed.notifier.callbackEmails).toHaveLength(2);
  });

  it("ponad 20 próśb na godzinę odmawia, a po godzinie przyjmuje", async () => {
    for (let i = 0; i < 20; i++) await request(`600 000 ${String(i).padStart(3, "0")}`);

    await expect(request("700 000 000")).rejects.toMatchObject({ code: "callback_busy" });
    testbed.clock.advance(HOUR);
    await request("700 000 000");

    expect(testbed.notifier.callbackEmails).toHaveLength(21);
  });

  it("błąd e-maila nie gubi prośby", async () => {
    testbed.notifier.failWith = new Error("Resend nie odpowiada");

    await request("600 123 456");

    expect(await listed()).toEqual([["+48600123456", null, "o-programie"]]);
  });

  it("super-admin widzi, ile próśb przyszło w ostatnich 7, 30 i 90 dniach", async () => {
    await request("600 000 001");
    testbed.clock.advance(20 * DAY);
    await request("600 000 002");
    testbed.clock.advance(5 * DAY);
    await request("600 000 003");
    testbed.clock.advance(3 * DAY);
    await request("600 000 004");

    const { counts } = await testbed.registry.superAdmin(await testbed.givenSuperAdmin()).callbackRequests();
    expect(counts).toEqual({ week: 2, month: 4, all: 4 });
  });

  it("super-admin widzi prośby z 90 dni, od najnowszej; po roku prośba znika z bazy", async () => {
    await request("600 000 001");
    testbed.clock.advance(100 * DAY);
    await request("600 000 002");
    expect(await listed()).toEqual([["+48600000002", null, "o-programie"]]);

    testbed.clock.advance(300 * DAY);
    await request("600 000 003");
    const rows = await testbed.db.transaction((sql) => sql<{ phone: string }>("select phone from app.callback_requests order by at"));
    expect(rows.map((row) => row.phone)).toEqual(["+48600000002", "+48600000003"]);
  });

  it("nikt poza super-adminem nie czyta próśb", async () => {
    const zawbud = await testbed.givenActiveCompany("Zawbud");
    await request("600 123 456");

    await expect(testbed.registry.superAdmin(zawbud.ownerId).callbackRequests()).rejects.toMatchObject({ code: "forbidden" });
  });
});
