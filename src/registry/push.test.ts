import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PushSubscriptionData, RegisteredKind } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Firma z bazą, kierownikami Nowakiem (Rataje) i Kowalskim (Winogrady) i szlifierkami S-01, S-02 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const kowalskiId = await testbed.givenMember(zawbud, "kierownik", "Jan Kowalski");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const s01 = (await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id })).toolId;
  const s02 = (await owner.addTool({ operationId: randomUUID(), code: "S-02", name: "Szlifierka mała", categoryId: grinders.id })).toolId;
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, kowalskiId, ratajeId, winogradyId, baseId: base.id, s01, s02 };
}

function move(actorId: string, kind: RegisteredKind, from: string, to: string, toolIds: string[], operationId = randomUUID()) {
  return testbed.registry.as(actorId).registerMovement({ operationId, kind, fromLocationId: from, toLocationId: to, toolIds, source: "checklista" });
}

/** Subskrypcja przeglądarki, tak jak ją zwraca `PushSubscription.toJSON()`. */
function browser(name: string, host = "fcm.googleapis.com"): Extract<PushSubscriptionData, { kind: "przegladarka" }> {
  return {
    kind: "przegladarka",
    endpoint: `https://${host}/fcm/send/${name}-${randomUUID()}`,
    keys: { p256dh: `klucz-${name}`, auth: `sekret-${name}` },
  };
}

/** Subskrypcja aplikacji na Androida: token rejestracji FCM tej instalacji. */
function app(name: string): Extract<PushSubscriptionData, { kind: "aplikacja" }> {
  return { kind: "aplikacja", token: `${name}-${randomUUID()}:APA91bH_${randomUUID().replaceAll("-", "")}` };
}

/** Urządzenie subskrypcji: adres przeglądarki albo token aplikacji. */
function deviceOf(subscription: PushSubscriptionData) {
  return subscription.kind === "przegladarka" ? subscription.endpoint : subscription.token;
}

/** Na które urządzenia poszły kopie i których wpisów. */
function pushedTo() {
  return testbed.notifier.pushed.map(({ subscription, message }) => ({ device: deviceOf(subscription), message }));
}

async function bellIds(userId: string) {
  return (await testbed.registry.as(userId).bell()).entries.map((entry) => entry.id);
}

describe("push: kopia wpisu z dzwonka", () => {
  it("Nowak zabiera S-01 z Winogrady: Kowalski dostaje push na telefon z tym wpisem dzwonka i e-mail", async () => {
    const z = await givenZawbud();
    const phone = browser("telefon-kowalskiego");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.nowakId).subscribeToPush(browser("telefon-nowaka"));
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    const [entryId] = await bellIds(z.kowalskiId);
    expect(pushedTo()).toEqual([
      {
        device: phone.endpoint,
        message: {
          window: "dzwonek",
          notificationId: entryId,
          notification: expect.objectContaining({ kind: "narzedzia_zabrane", movementId: movement.id }),
        },
      },
    ]);
    expect(testbed.notifier.pushed[0].subscription).toEqual(phone);
    expect(testbed.notifier.sent).toHaveLength(1);
  });

  it("kopia idzie na każdą przeglądarkę, w której Kowalski włączył powiadomienia", async () => {
    const z = await givenZawbud();
    const phone = browser("telefon");
    const tablet = browser("tablet", "web.push.apple.com");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(tablet);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(pushedTo().map((push) => push.device).sort()).toEqual([phone.endpoint, tablet.endpoint].sort());
  });

  it("ponowne wysłanie tej samej operacji nie wysyła pusha drugi raz", async () => {
    const z = await givenZawbud();
    await testbed.registry.as(z.kowalskiId).subscribeToPush(browser("telefon"));
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    const operationId = randomUUID();
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01], operationId);

    expect(testbed.notifier.pushed).toHaveLength(1);
  });

  it("gdy push się nie uda, przeniesienie i wpis w dzwonku zostają, a e-mail idzie", async () => {
    const z = await givenZawbud();
    await testbed.registry.as(z.kowalskiId).subscribeToPush(browser("telefon"));
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    testbed.notifier.pushFailWith = new Error("Usługa push nie odpowiada");

    const movement = await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(movement.to).toEqual({ id: z.ratajeId, name: "Rataje" });
    expect(await bellIds(z.kowalskiId)).toHaveLength(1);
    expect(testbed.notifier.sent).toHaveLength(1);
  });

  it("przekroczenie progu dni: Kowalski dostaje push o narzędziu, a właściciel zbiorczy", async () => {
    const z = await givenZawbud();
    const kowalskiPhone = browser("kowalski");
    const ownerPhone = browser("wlasciciel");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(kowalskiPhone);
    await testbed.registry.as(z.zawbud.ownerId).subscribeToPush(ownerPhone);
    await z.owner.updateSettings({ alarmThresholdDays: 30 });
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    testbed.clock.advance(31 * DAY + HOUR);

    await testbed.registry.system().notifyExceededThresholds();

    const [kowalskiEntry] = await bellIds(z.kowalskiId);
    const [ownerEntry] = await bellIds(z.zawbud.ownerId);
    expect(pushedTo()).toEqual(
      expect.arrayContaining([
        {
          device: kowalskiPhone.endpoint,
          message: { window: "dzwonek", notificationId: kowalskiEntry, notification: expect.objectContaining({ kind: "prog_przekroczony" }) },
        },
        {
          device: ownerPhone.endpoint,
          message: { window: "dzwonek", notificationId: ownerEntry, notification: expect.objectContaining({ kind: "progi_przekroczone" }) },
        },
      ]),
    );
    expect(testbed.notifier.pushed).toHaveLength(2);

    // Następnego dnia nic się nie powtarza, więc push też nie.
    testbed.clock.advance(DAY);
    await testbed.registry.system().notifyExceededThresholds();
    expect(testbed.notifier.pushed).toHaveLength(2);
  });

  it("odrzucony ruch z kolejki offline: autor dostaje push z wpisem dzwonka", async () => {
    const z = await givenZawbud();
    const phone = browser("nowak");
    await testbed.registry.as(z.nowakId).subscribeToPush(phone);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    // S-01 nie jest już na bazie, więc wydanie z kolejki Nowaka się nie uda.
    const result = await testbed.registry.as(z.nowakId).registerQueuedMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: z.ratajeId,
      toolIds: [z.s01],
      source: "checklista",
    });

    expect(result.status).toBe("rejected");
    const [entryId] = await bellIds(z.nowakId);
    expect(pushedTo()).toEqual([
      {
        device: phone.endpoint,
        message: { window: "dzwonek", notificationId: entryId, notification: expect.objectContaining({ kind: "ruch_odrzucony" }) },
      },
    ]);
  });
});

describe("push: subskrypcje", () => {
  it("subskrypcja, która wygasła, znika po pierwszej nieudanej wysyłce", async () => {
    const z = await givenZawbud();
    const oldPhone = browser("stary-telefon");
    const newPhone = browser("nowy-telefon");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(oldPhone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(newPhone);
    testbed.notifier.expired.add(oldPhone.endpoint);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01, z.s02]);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    testbed.notifier.clear();

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02]);

    expect(pushedTo().map((push) => push.device)).toEqual([newPhone.endpoint]);
  });

  it("po wyłączeniu powiadomień w przeglądarce kopie tam nie idą", async () => {
    const z = await givenZawbud();
    const phone = browser("telefon");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await testbed.registry.as(z.kowalskiId).unsubscribeFromPush(phone);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(testbed.notifier.pushed).toEqual([]);
    expect(await bellIds(z.kowalskiId)).toHaveLength(1);
  });

  it("nikt nie wyłączy powiadomień w cudzej przeglądarce", async () => {
    const z = await givenZawbud();
    const phone = browser("telefon");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await testbed.registry.as(z.nowakId).unsubscribeFromPush(phone);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(pushedTo().map((push) => push.device)).toEqual([phone.endpoint]);
  });

  it("ta sama przeglądarka po zmianie osoby dostaje kopie tylko nowej osoby", async () => {
    const z = await givenZawbud();
    const sharedPhone = browser("wspolny-telefon");
    await testbed.registry.as(z.nowakId).subscribeToPush(sharedPhone);
    // Nowak oddaje telefon Kowalskiemu, który loguje się i włącza powiadomienia.
    await testbed.registry.as(z.kowalskiId).subscribeToPush({ ...sharedPhone, keys: { p256dh: "nowy-klucz", auth: "nowy-sekret" } });
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);

    await move(z.kowalskiId, "przeniesienie", z.ratajeId, z.winogradyId, [z.s01]);
    expect(testbed.notifier.pushed).toEqual([]);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02]);
    expect(testbed.notifier.pushed).toEqual([
      expect.objectContaining({
        subscription: { kind: "przegladarka", endpoint: sharedPhone.endpoint, keys: { p256dh: "nowy-klucz", auth: "nowy-sekret" } },
      }),
    ]);
  });

  it("ponowne włączenie w tej samej przeglądarce nie dubluje kopii", async () => {
    const z = await givenZawbud();
    const phone = browser("telefon");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(testbed.notifier.pushed).toHaveLength(1);
  });

  it("przyjmuje tylko adresy znanych usług push (https), z kluczami", async () => {
    const z = await givenZawbud();
    const kowalski = testbed.registry.as(z.kowalskiId);
    const invalid: PushSubscriptionData[] = [
      { ...browser("http"), endpoint: "http://fcm.googleapis.com/fcm/send/abc" },
      browser("wewnetrzny", "localhost"),
      browser("podszyty", "fcm.googleapis.com.zly.test"),
      { ...browser("bez-kluczy"), keys: { p256dh: "", auth: "sekret" } },
      { kind: "przegladarka", endpoint: "nie adres", keys: { p256dh: "k", auth: "s" } },
    ];

    for (const subscription of invalid) {
      await expect(kowalski.subscribeToPush(subscription)).rejects.toMatchObject({ code: "invalid_input" });
    }
    for (const host of ["fcm.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com", "wns2-db5p.notify.windows.com"]) {
      await expect(kowalski.subscribeToPush(browser("dobry", host))).resolves.toBeUndefined();
    }
  });
});

describe("push: kopia wpisu z okna 📋 zgłoszeń", () => {
  it("pracownik zgłasza uszkodzenie S-01: właściciel dostaje push z wpisem okna zgłoszeń, autor nie", async () => {
    const z = await givenZawbud();
    const workerId = await testbed.givenMember(z.zawbud, "pracownik", "Marek Zieliński");
    const ownerPhone = browser("wlasciciel");
    await z.owner.subscribeToPush(ownerPhone);
    await testbed.registry.as(workerId).subscribeToPush(browser("pracownik"));
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    const { issueId } = await testbed.registry
      .as(workerId)
      .fileIssue({ operationId: randomUUID(), kind: "uszkodzenie", toolId: z.s01, description: "Tarcza bije" });

    expect(pushedTo()).toEqual([
      {
        device: ownerPhone.endpoint,
        message: {
          window: "zgloszenia",
          entryId: expect.any(String),
          entry: {
            kind: "zgloszenie",
            issueId,
            issue: { kind: "uszkodzenie", tool: { code: "S-01", name: "Szlifierka kątowa" }, place: "Winogrady" },
            author: "Marek Zieliński",
            text: "Tarcza bije",
          },
        },
      },
    ]);
    expect(testbed.notifier.sent).toEqual([]);
  });

  it("komentarz i zamknięcie idą push do autora; ponowienie komentarza nie wysyła drugi raz", async () => {
    const z = await givenZawbud();
    const phone = browser("nowak");
    await testbed.registry.as(z.nowakId).subscribeToPush(phone);
    const { issueId } = await testbed.registry
      .as(z.nowakId)
      .fileIssue({ operationId: randomUUID(), kind: "inne", locationId: z.ratajeId, description: "Brakuje kasków" });
    const operationId = randomUUID();

    await z.owner.commentOnIssue({ operationId, issueId, text: "Zamówione" });
    await z.owner.commentOnIssue({ operationId, issueId, text: "Zamówione" });
    await z.owner.closeIssue({ operationId: randomUUID(), issueId, comment: "Są w kontenerze" });

    expect(pushedTo().map(({ device, message }) => [device, message.window === "zgloszenia" && message.entry.kind])).toEqual([
      [phone.endpoint, "komentarz"],
      [phone.endpoint, "zamkniecie"],
    ]);
  });

  it("zgłoszone narzędzie z budowy: właściciel dostaje push, a ponowienie zgłoszenia go nie powtarza", async () => {
    const z = await givenZawbud();
    const ownerPhone = browser("wlasciciel");
    await z.owner.subscribeToPush(ownerPhone);
    const [category] = await z.owner.categories();
    const input = { operationId: randomUUID(), siteId: z.ratajeId, name: "Młot Hilti", categoryId: category.id };

    const { toolId, code } = await testbed.registry.as(z.nowakId).reportTool(input);
    await testbed.registry.as(z.nowakId).reportTool(input);

    expect(pushedTo()).toEqual([
      {
        device: ownerPhone.endpoint,
        message: {
          window: "zgloszenia",
          entryId: expect.any(String),
          entry: { kind: "zgloszenie_narzedzia", toolId, code, name: "Młot Hilti", place: "Rataje", author: "Adam Nowak" },
        },
      },
    ]);
  });
});

describe("push: odpowiedź supportu w oknie 💬 czatu", () => {
  it("odpowiedź supportu idzie push do użytkownika; jego wiadomość i automatyczna odpowiedź nie, a ponowienie nie powtarza", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    const phone = browser("nowak");
    await testbed.registry.as(z.nowakId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(browser("kowalski"));
    await testbed.registry.as(z.nowakId).sendSupportMessage({ operationId: randomUUID(), text: "Nie widzę budowy" });
    expect(testbed.notifier.pushed).toEqual([]);
    const operationId = randomUUID();

    await testbed.registry.superAdmin(adminId).replyToSupportThread({ operationId, threadId: z.nowakId, text: "Już dodana" });
    await testbed.registry.superAdmin(adminId).replyToSupportThread({ operationId, threadId: z.nowakId, text: "Już dodana" });

    const reply = (await testbed.registry.as(z.nowakId).supportChat()).messages.at(-1)!;
    expect(pushedTo()).toEqual([{ device: phone.endpoint, message: { window: "czat", messageId: reply.id, reply: { text: "Już dodana", photo: false } } }]);
  });
});

describe("push: aplikacja na Androida (FCM)", () => {
  it("kopia wpisu dzwonka idzie i na telefon z aplikacją, i na przeglądarkę na laptopie", async () => {
    const z = await givenZawbud();
    const phone = app("telefon-kowalskiego");
    const laptop = browser("laptop-kowalskiego");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(laptop);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    const [entryId] = await bellIds(z.kowalskiId);
    const message = { window: "dzwonek", notificationId: entryId, notification: expect.objectContaining({ kind: "narzedzia_zabrane" }) };
    expect(pushedTo()).toEqual(
      expect.arrayContaining([
        { device: phone.token, message },
        { device: laptop.endpoint, message },
      ]),
    );
    expect(testbed.notifier.pushed).toHaveLength(2);
    expect(testbed.notifier.pushed.find((push) => push.subscription.kind === "aplikacja")?.subscription).toEqual(phone);
  });

  it("nowe zgłoszenie idzie na aplikację właściciela, a odpowiedź supportu na aplikację autora", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    const ownerPhone = app("wlasciciel");
    const nowakPhone = app("nowak");
    await z.owner.subscribeToPush(ownerPhone);
    await testbed.registry.as(z.nowakId).subscribeToPush(nowakPhone);

    const { issueId } = await testbed.registry
      .as(z.nowakId)
      .fileIssue({ operationId: randomUUID(), kind: "inne", locationId: z.ratajeId, description: "Brakuje kasków" });
    await testbed.registry.as(z.nowakId).sendSupportMessage({ operationId: randomUUID(), text: "Nie widzę budowy" });
    await testbed.registry.superAdmin(adminId).replyToSupportThread({ operationId: randomUUID(), threadId: z.nowakId, text: "Już dodana" });

    expect(pushedTo()).toEqual([
      { device: ownerPhone.token, message: expect.objectContaining({ window: "zgloszenia", entry: expect.objectContaining({ kind: "zgloszenie", issueId }) }) },
      { device: nowakPhone.token, message: expect.objectContaining({ window: "czat", reply: { text: "Już dodana", photo: false } }) },
    ]);
  });

  it("token, który FCM uznał za nieważny albo wyrejestrowany, znika po pierwszej nieudanej wysyłce", async () => {
    const z = await givenZawbud();
    const uninstalled = app("odinstalowana");
    const current = app("obecna");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(uninstalled);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(current);
    testbed.notifier.expired.add(uninstalled.token);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01, z.s02]);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    testbed.notifier.clear();

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02]);

    expect(pushedTo().map((push) => push.device)).toEqual([current.token]);
  });

  it("po wyłączeniu przełącznikiem kopie na ten telefon nie idą; cudzego tokenu nikt nie wyłączy", async () => {
    const z = await givenZawbud();
    const kowalskiPhone = app("kowalski");
    const nowakPhone = app("nowak");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(kowalskiPhone);
    await testbed.registry.as(z.nowakId).subscribeToPush(nowakPhone);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s02]);

    await testbed.registry.as(z.kowalskiId).unsubscribeFromPush({ kind: "aplikacja", token: kowalskiPhone.token });
    await testbed.registry.as(z.kowalskiId).unsubscribeFromPush({ kind: "aplikacja", token: nowakPhone.token });
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);
    await move(z.kowalskiId, "przeniesienie", z.ratajeId, z.winogradyId, [z.s02]);

    expect(pushedTo().map((push) => push.device)).toEqual([nowakPhone.token]);
  });

  it("telefon po pracowniku, który odszedł: nowa osoba dostaje tylko swoje kopie, a ponowne włączenie ich nie dubluje", async () => {
    const z = await givenZawbud();
    const phone = app("sluzbowy");
    await testbed.registry.as(z.nowakId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await move(z.nowakId, "wydanie", z.baseId, z.ratajeId, [z.s01]);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s02]);

    await move(z.kowalskiId, "przeniesienie", z.ratajeId, z.winogradyId, [z.s01]);
    expect(testbed.notifier.pushed).toEqual([]);

    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s02]);
    expect(pushedTo()).toEqual([{ device: phone.token, message: expect.objectContaining({ window: "dzwonek" }) }]);
  });

  it("wyłączenie w przeglądarce nie rusza aplikacji tej osoby, nawet gdy podany adres to token aplikacji", async () => {
    const z = await givenZawbud();
    const phone = app("telefon");
    const laptop = browser("laptop");
    await testbed.registry.as(z.kowalskiId).subscribeToPush(phone);
    await testbed.registry.as(z.kowalskiId).subscribeToPush(laptop);
    await move(z.kowalskiId, "wydanie", z.baseId, z.winogradyId, [z.s01]);

    await testbed.registry.as(z.kowalskiId).unsubscribeFromPush({ kind: "przegladarka", endpoint: phone.token });
    await testbed.registry.as(z.kowalskiId).unsubscribeFromPush(laptop);
    await move(z.nowakId, "przeniesienie", z.winogradyId, z.ratajeId, [z.s01]);

    expect(pushedTo().map((push) => push.device)).toEqual([phone.token]);
  });

  it("przyjmuje tylko token FCM: niepusty, bez spacji i znaków spoza tokenu, nie za długi", async () => {
    const z = await givenZawbud();
    const kowalski = testbed.registry.as(z.kowalskiId);
    const invalid = ["", "   ", "token ze spacją", "token/../ukośnik", `x${"a".repeat(4096)}`];

    for (const token of invalid) {
      await expect(kowalski.subscribeToPush({ kind: "aplikacja", token })).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(kowalski.subscribeToPush({ kind: "nieznany", token: "abc" } as unknown as PushSubscriptionData)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(kowalski.subscribeToPush(app("dobry"))).resolves.toBeUndefined();
  });
});
