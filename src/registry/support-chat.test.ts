import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withActor } from "./registry";
import { setupRegistryTestbed } from "./testing/harness";

const testbed = setupRegistryTestbed();
const HOUR = 60 * 60 * 1000;
const AUTO_REPLY = "Dzięki za wiadomość! Odpiszemy, jak tylko znajdziemy chwilę.";
const DAY = 24 * HOUR;
/** Najmniejszy prawdziwy PNG (1×1 px). */
const PNG = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")]);

/** Firma Zawbud z kierownikiem Nowakiem. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { email: "szef@zawbud.test" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  return { zawbud, ownerId: zawbud.ownerId, nowakId };
}

function write(userId: string, text: string, extra: { photo?: Blob; screen?: string; appVersion?: string; operationId?: string } = {}) {
  return testbed.registry.as(userId).sendSupportMessage({ operationId: extra.operationId ?? randomUUID(), text, ...extra });
}

async function chat(userId: string) {
  return (await testbed.registry.as(userId).supportChat()).messages.map(({ sender, text }) => [sender, text]);
}

describe("czat z supportem: użytkownik pisze", () => {
  it("pierwsza wiadomość właściciela dostaje automatyczną odpowiedź, a support e-mail z kontekstem", async () => {
    const z = await givenZawbud();

    await write(z.ownerId, "Jak dodać drugiego magazyniera?", { screen: "/zespol", appVersion: "0.1.0+abc1234" });

    expect(await chat(z.ownerId)).toEqual([
      ["uzytkownik", "Jak dodać drugiego magazyniera?"],
      ["auto", AUTO_REPLY],
    ]);
    expect(testbed.notifier.supportEmails).toEqual([
      {
        messageId: expect.any(String),
        threadId: z.ownerId,
        company: { id: z.zawbud.companyId, name: "Zawbud" },
        user: { fullName: "Właściciel Zawbud", role: "wlasciciel", email: "szef@zawbud.test" },
        text: "Jak dodać drugiego magazyniera?",
        photo: false,
        screen: "/zespol",
        appVersion: "0.1.0+abc1234",
        sentAt: testbed.clock.now(),
      },
    ]);
  });

  it("automatyczna odpowiedź wraca dopiero wtedy, gdy od naszej ostatniej odpowiedzi minęła doba", async () => {
    const z = await givenZawbud();
    await write(z.nowakId, "Skaner nie łapie kodu");
    testbed.clock.advance(HOUR);
    await write(z.nowakId, "Już działa, to był brudny obiektyw");
    testbed.clock.advance(25 * HOUR);

    await write(z.nowakId, "Jeszcze jedno pytanie");

    expect(await chat(z.nowakId)).toEqual([
      ["uzytkownik", "Skaner nie łapie kodu"],
      ["auto", AUTO_REPLY],
      ["uzytkownik", "Już działa, to był brudny obiektyw"],
      ["uzytkownik", "Jeszcze jedno pytanie"],
      ["auto", AUTO_REPLY],
    ]);
    expect(testbed.notifier.supportEmails.map((email) => email.text)).toEqual([
      "Skaner nie łapie kodu",
      "Już działa, to był brudny obiektyw",
      "Jeszcze jedno pytanie",
    ]);
  });

  it("ponowne wysłanie tej samej wiadomości nie dubluje jej w wątku ani w e-mailu", async () => {
    const z = await givenZawbud();
    const operationId = randomUUID();

    await write(z.nowakId, "Halo", { operationId });
    await write(z.nowakId, "Halo", { operationId });

    expect(await chat(z.nowakId)).toEqual([
      ["uzytkownik", "Halo"],
      ["auto", AUTO_REPLY],
    ]);
    expect(testbed.notifier.supportEmails).toHaveLength(1);
  });

  it("wiadomość bez tekstu i zdjęcia się nie zapisuje", async () => {
    const z = await givenZawbud();

    await expect(write(z.nowakId, "   ")).rejects.toMatchObject({ code: "message_required" });
    expect(await chat(z.nowakId)).toEqual([]);
  });

  it("gdy e-mail do supportu się nie uda, wiadomość i tak jest w wątku", async () => {
    const z = await givenZawbud();
    testbed.notifier.failWith = new Error("Resend nie odpowiada");

    await write(z.nowakId, "Halo");

    expect(await chat(z.nowakId)).toEqual([
      ["uzytkownik", "Halo"],
      ["auto", AUTO_REPLY],
    ]);
  });
});

describe("czat z supportem: odpowiadamy z panelu super-admina", () => {
  function reply(superAdminId: string, threadId: string, text: string, extra: { photo?: Blob; operationId?: string } = {}) {
    return testbed.registry.superAdmin(superAdminId).replyToSupportThread({ operationId: extra.operationId ?? randomUUID(), threadId, text, ...extra });
  }

  it("lista wątków ze wszystkich firm: nieprzeczytane na górze, potem od najnowszej wiadomości", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    const adminId = await testbed.givenSuperAdmin();
    await write(z.nowakId, "Pytanie Nowaka");
    testbed.clock.advance(HOUR);
    await write(budrex.ownerId, "Pytanie z Budreksu");
    await testbed.registry.superAdmin(adminId).markSupportThreadRead(budrex.ownerId);
    testbed.clock.advance(HOUR);
    await write(z.ownerId, "Pytanie szefa Zawbudu");
    await write(z.ownerId, "I jeszcze jedno");

    const threads = await testbed.registry.superAdmin(adminId).supportThreads();

    expect(threads.map((thread) => [thread.company.name, thread.user.fullName, thread.unread, thread.lastMessage.text])).toEqual([
      ["Zawbud", "Właściciel Zawbud", 2, "I jeszcze jedno"],
      ["Zawbud", "Adam Nowak", 1, AUTO_REPLY],
      ["Budrex", "Właściciel Budrex", 0, AUTO_REPLY],
    ]);
    expect(await testbed.registry.superAdmin(adminId).unreadSupportThreadCount()).toBe(2);
  });

  it("wątek w panelu pokazuje kontekst każdej wiadomości użytkownika", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    await write(z.nowakId, "Nie widzę budowy", { screen: "/ruch", appVersion: "0.1.0+abc1234" });

    const thread = await testbed.registry.superAdmin(adminId).supportThread(z.nowakId);

    expect(thread).toMatchObject({
      id: z.nowakId,
      company: { id: z.zawbud.companyId, name: "Zawbud" },
      user: { fullName: "Adam Nowak", role: "kierownik", active: true },
      unread: 1,
    });
    expect(thread?.messages.map(({ sender, text, context }) => [sender, text, context])).toEqual([
      ["uzytkownik", "Nie widzę budowy", { role: "kierownik", screen: "/ruch", appVersion: "0.1.0+abc1234" }],
      ["auto", AUTO_REPLY, null],
    ]);
  });

  it("odpowiedź supportu trafia do okna 💬 użytkownika z licznikiem i kopią push, a automatu wtedy nie ma", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    const phone = { kind: "przegladarka" as const, endpoint: `https://fcm.googleapis.com/fcm/send/nowak-${randomUUID()}`, keys: { p256dh: "klucz", auth: "sekret" } };
    await testbed.registry.as(z.nowakId).subscribeToPush(phone);
    await write(z.nowakId, "Nie widzę budowy");
    expect(testbed.notifier.pushed).toEqual([]);

    await reply(adminId, z.nowakId, "Budowę dodaje właściciel w Lokalizacjach");
    testbed.clock.advance(HOUR);
    await write(z.nowakId, "Dzięki!");

    expect(await chat(z.nowakId)).toEqual([
      ["uzytkownik", "Nie widzę budowy"],
      ["auto", AUTO_REPLY],
      ["support", "Budowę dodaje właściciel w Lokalizacjach"],
      ["uzytkownik", "Dzięki!"],
    ]);
    expect(testbed.notifier.pushed).toEqual([
      {
        subscription: phone,
        message: { window: "czat", messageId: expect.any(String), reply: { text: "Budowę dodaje właściciel w Lokalizacjach", photo: false } },
      },
    ]);
  });

  it("licznik 💬 liczy nieprzeczytane odpowiedzi supportu do otwarcia okna", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    const nowak = testbed.registry.as(z.nowakId);
    await write(z.nowakId, "Halo");
    expect(await nowak.unreadSupportReplyCount()).toBe(0);

    await reply(adminId, z.nowakId, "Dzień dobry");
    await reply(adminId, z.nowakId, "W czym pomóc?");
    expect(await nowak.unreadSupportReplyCount()).toBe(2);

    await nowak.markSupportChatRead();
    expect(await nowak.unreadSupportReplyCount()).toBe(0);
  });

  it("odpowiedź czyta wątek za support, a ponowienie jej nie dubluje", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    await write(z.nowakId, "Halo");
    const operationId = randomUUID();

    await reply(adminId, z.nowakId, "Dzień dobry", { operationId });
    await reply(adminId, z.nowakId, "Dzień dobry", { operationId });

    expect((await chat(z.nowakId)).filter(([sender]) => sender === "support")).toHaveLength(1);
    expect(await testbed.registry.superAdmin(adminId).unreadSupportThreadCount()).toBe(0);
  });

  it("nie odpowiemy w wątku, którego nie ma, a nikt poza super-adminem nie odpowie za support", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    await write(z.nowakId, "Halo");

    await expect(reply(adminId, z.ownerId, "Dzień dobry")).rejects.toMatchObject({ code: "not_found" });
    await expect(reply(z.ownerId, z.nowakId, "Tu szef")).rejects.toMatchObject({ code: "forbidden" });
    await expect(testbed.registry.superAdmin(z.ownerId).supportThreads()).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("czat z supportem: kto widzi który wątek", () => {
  it("każdy widzi tylko swój wątek; właściciel nie czyta wątku swojego kierownika", async () => {
    const z = await givenZawbud();
    const magazynierId = await testbed.givenMember(z.zawbud, "magazynier", "Ewa Lis");
    await write(z.nowakId, "Pytanie Nowaka");
    await write(magazynierId, "Pytanie Ewy");

    expect(await chat(z.ownerId)).toEqual([]);
    expect(await chat(magazynierId)).toEqual([
      ["uzytkownik", "Pytanie Ewy"],
      ["auto", AUTO_REPLY],
    ]);
  });

  it("połączenie z bazą jako użytkownik nie pokaże cudzych wątków ani nie dopisze wiadomości do cudzego wątku", async () => {
    const z = await givenZawbud();
    const budrex = await testbed.givenActiveCompany("Budrex");
    await write(z.nowakId, "Pytanie Nowaka");
    await write(budrex.ownerId, "Pytanie Budreksu");

    const seen = await withActor(testbed.db, z.ownerId, async (sql) => ({
      threads: await sql("select * from app.support_threads"),
      messages: await sql("select * from app.support_messages"),
    }));
    expect(seen).toEqual({ threads: [], messages: [] });

    await expect(
      withActor(testbed.db, z.ownerId, (sql) =>
        sql(
          `insert into app.support_messages (thread_id, sender, author_id, body, role, created_at, client_operation_id)
           values ($1, 'uzytkownik', $1, 'Podszywam się', 'kierownik', now(), gen_random_uuid())`,
          [z.nowakId],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withActor(testbed.db, z.nowakId, (sql) =>
        sql("insert into app.support_messages (thread_id, sender, body, created_at) values ($1, 'auto', 'Udaję automat', now())", [z.nowakId]),
      ),
    ).rejects.toThrow();
  });

  it("pracownik nie ma czatu", async () => {
    const z = await givenZawbud();
    const workerId = await testbed.givenMember(z.zawbud, "pracownik", "Marek Zieliński");
    const worker = testbed.registry.as(workerId);

    await expect(write(workerId, "Halo")).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.supportChat()).rejects.toMatchObject({ code: "forbidden" });
    await expect(worker.unreadSupportReplyCount()).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      withActor(testbed.db, workerId, (sql) =>
        sql("insert into app.support_threads (user_id, company_id, created_at) values ($1, $2, now())", [workerId, z.zawbud.companyId]),
      ),
    ).rejects.toThrow();
    expect(testbed.notifier.supportEmails).toEqual([]);
  });

  it("wiadomości w wątku tylko się dopisują", async () => {
    const z = await givenZawbud();
    await write(z.nowakId, "Halo");

    await expect(
      testbed.db.transaction((sql) => sql("update app.support_messages set body = 'Inaczej' where thread_id = $1", [z.nowakId])),
    ).rejects.toThrow(/tylko się dopisuje/);
    await expect(testbed.db.transaction((sql) => sql("delete from app.support_messages where thread_id = $1", [z.nowakId]))).rejects.toThrow(
      /tylko się dopisuje/,
    );
  });
});

describe("czat z supportem w trybie tylko do odczytu", () => {
  it("zablokowany użytkownik pisze do nas (ze zdjęciem) i czyta odpowiedzi, choć innych zapisów nie zrobi", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    const admin = testbed.registry.superAdmin(adminId);
    await admin.setPaidUntil(z.zawbud.companyId, "2026-02-01");
    testbed.clock.advance(DAY);
    const owner = testbed.registry.as(z.ownerId);
    expect((await owner.session())?.company.readOnly).toBe(true);
    await expect(owner.addCategory({ name: "Młoty", prefix: "M" })).rejects.toMatchObject({ code: "read_only" });

    await write(z.ownerId, "Przelew poszedł wczoraj", { photo: PNG });
    await admin.replyToSupportThread({ operationId: randomUUID(), threadId: z.ownerId, text: "Dzięki, odblokowujemy" });
    await owner.markSupportChatRead();

    expect(await chat(z.ownerId)).toEqual([
      ["uzytkownik", "Przelew poszedł wczoraj"],
      ["auto", AUTO_REPLY],
      ["support", "Dzięki, odblokowujemy"],
    ]);
    expect(await owner.unreadSupportReplyCount()).toBe(0);
    expect(testbed.notifier.supportEmails).toMatchObject([{ text: "Przelew poszedł wczoraj", photo: true }]);
  });
});

describe("czat z supportem: zdjęcia", () => {
  it("zrzut ekranu bez tekstu: użytkownik i support go widzą, inni nie", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();

    await write(z.nowakId, "", { photo: PNG });

    const [message] = (await testbed.registry.as(z.nowakId).supportChat()).messages;
    expect(message).toMatchObject({ sender: "uzytkownik", text: "", photo: true });
    expect(await testbed.registry.as(z.nowakId).supportPhoto(message.id)).toMatchObject({ type: "image/png", size: PNG.size });
    expect(await testbed.registry.superAdmin(adminId).supportPhoto(message.id)).toMatchObject({ type: "image/png" });
    expect(await testbed.registry.as(z.ownerId).supportPhoto(message.id)).toBeNull();
  });

  it("zdjęcie w odpowiedzi supportu idzie w kopii push jako zdjęcie", async () => {
    const z = await givenZawbud();
    const adminId = await testbed.givenSuperAdmin();
    await testbed.registry.as(z.nowakId).subscribeToPush({ kind: "przegladarka", endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, keys: { p256dh: "k", auth: "s" } });
    await write(z.nowakId, "Gdzie jest import?");

    await testbed.registry.superAdmin(adminId).replyToSupportThread({ operationId: randomUUID(), threadId: z.nowakId, text: "", photo: PNG });

    const reply = (await testbed.registry.as(z.nowakId).supportChat()).messages.at(-1)!;
    expect(reply).toMatchObject({ sender: "support", photo: true });
    expect(await testbed.registry.as(z.nowakId).supportPhoto(reply.id)).not.toBeNull();
    expect(testbed.notifier.pushed.map((push) => push.message)).toEqual([{ window: "czat", messageId: reply.id, reply: { text: "", photo: true } }]);
  });

  it("plik, który nie jest zdjęciem, albo za długi tekst odrzuca bez zapisu czegokolwiek", async () => {
    const z = await givenZawbud();

    await expect(write(z.nowakId, "Log", { photo: new Blob(["to nie zdjęcie"]) })).rejects.toMatchObject({ code: "photo_invalid" });
    await expect(write(z.nowakId, "x".repeat(2001), { photo: PNG })).rejects.toMatchObject({ code: "invalid_input" });

    expect(testbed.chatPhotos.photos.size).toBe(0);
    expect(await chat(z.nowakId)).toEqual([]);
  });

  it("gdy Storage nie przyjmie zdjęcia, wiadomości nie ma i support nie dostaje e-maila", async () => {
    const z = await givenZawbud();
    testbed.chatPhotos.failWith = new Error("Storage nie odpowiada");

    await expect(write(z.nowakId, "Zrzut", { photo: PNG })).rejects.toThrow("Storage nie odpowiada");

    expect(await chat(z.nowakId)).toEqual([]);
    expect(testbed.notifier.supportEmails).toEqual([]);
  });
});
