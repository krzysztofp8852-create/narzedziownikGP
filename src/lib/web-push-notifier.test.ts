import webpush from "web-push";
import { describe, expect, it, vi } from "vitest";
import type { PushMessage } from "@/registry/registry";
import { createWebPushChannel, pushNotification } from "./web-push-notifier";

const taken: PushMessage = {
  window: "dzwonek",
  notificationId: "5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
  notification: {
    kind: "narzedzia_zabrane",
    movementId: "0b8e2f4a-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
    takenBy: "Adam Nowak",
    from: { id: "f", name: "Winogrady" },
    to: { id: "t", name: "Rataje" },
    tools: [{ id: "s01", code: "S-01", name: "Szlifierka kątowa" }],
    occurredAt: new Date("2026-03-05T09:00:00Z"),
  },
};

const subscription = { kind: "przegladarka" as const, endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "klucz", auth: "sekret" } };
const vapid = { publicKey: "publiczny", privateKey: "prywatny", subject: "mailto:powiadomienia@gp-engineering.pl" };

describe("powiadomienie push z wpisu dzwonka", () => {
  it("ma ten sam tekst co dzwonek, a kliknięcie otwiera wpis", () => {
    expect(pushNotification(taken)).toEqual({
      title: "Adam Nowak zabiera S-01 z budowy Winogrady",
      body: expect.stringContaining("Sprzęt jest teraz na budowie Rataje"),
      url: "/dzwonek/5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
      tag: "dzwonek:5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
    });
  });

  it("długą listę narzędzi skraca, żeby zmieściła się w wiadomości push", () => {
    const tools = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, code: `S-${i}`, name: "Szlifierka", location: { id: "r", name: "Rataje" } }));
    const { body } = pushNotification({
      window: "dzwonek",
      notificationId: "id",
      notification: { kind: "progi_przekroczone", thresholdDays: 30, tools },
    });
    expect(body.length).toBeLessThanOrEqual(300);
    expect(body.endsWith("…")).toBe(true);
  });

  it("raport piątkowy: ile sprzętu i gdzie, a kliknięcie otwiera wpis dzwonka, który prowadzi do raportu", () => {
    const tool = (code: string) => ({ id: code, code, name: "Szlifierka", days: 3 });
    const push = pushNotification({
      window: "dzwonek",
      notificationId: "raport-1",
      notification: {
        kind: "raport_piatkowy",
        report: {
          kind: "piatkowy",
          day: "2026-04-10",
          locations: [
            { id: "r", name: "Rataje", kind: "budowa", manager: { id: "n", fullName: "Adam Nowak" }, tools: [tool("S-01"), tool("S-02")] },
            { id: "w", name: "Winogrady", kind: "budowa", manager: { id: "k", fullName: "Jan Kowalski" }, tools: [tool("S-03")] },
          ],
        },
      },
    });
    expect(push).toEqual({
      title: "Przed weekendem poza bazą: 3 szt.",
      body: "Rataje: 2 szt. · Winogrady: 1 szt.",
      url: "/dzwonek/raport-1",
      tag: "dzwonek:raport-1",
    });
  });
});

describe("powiadomienie push o terminach", () => {
  const calibration = {
    id: "d1",
    kind: "kalibracja" as const,
    dueOn: "2026-03-13",
    overdue: false,
    tool: { id: "n01", code: "N-01", name: "Niwelator laserowy" },
    location: { id: "r", name: "Rataje", kind: "budowa" as const },
  };

  it("jeden termin: co, kiedy i gdzie jest teraz sprzęt", () => {
    expect(pushNotification({ window: "dzwonek", notificationId: "t-1", notification: { kind: "terminy", deadlines: [calibration] } })).toEqual({
      title: "Kalibracja N-01 Niwelator laserowy: termin 13.03.2026",
      body: "Sprzęt jest teraz na budowie Rataje.",
      url: "/dzwonek/t-1",
      tag: "dzwonek:t-1",
    });
  });

  it("kilka terminów: ile, a w treści każdy z kodem, także po terminie i koniec gwarancji", () => {
    const push = pushNotification({
      window: "dzwonek",
      notificationId: "t-2",
      notification: {
        kind: "terminy",
        deadlines: [
          { ...calibration, id: "d0", kind: "przeglad", dueOn: "2026-02-20", overdue: true, tool: { id: "h01", code: "H-01", name: "Młot" } },
          calibration,
          { ...calibration, id: "d2", kind: "gwarancja", dueOn: "2026-03-14", location: { id: "b", name: "Magazyn", kind: "baza" } },
        ],
      },
    });
    expect(push).toMatchObject({
      title: "Terminy: 3",
      body: "H-01: przegląd, po terminie (20.02.2026) · N-01: kalibracja, termin 13.03.2026 · N-01: gwarancja, koniec 14.03.2026",
    });
  });

  it("termin pojazdu: rodzaj albo nazwa własnego terminu i pojazd zamiast kodu narzędzia", () => {
    const liability = { ...calibration, id: "d3", kind: "oc" as const, dueOn: "2026-04-10", tool: null, location: { id: "bus", name: "Bus Ducato", kind: "pojazd" as const } };
    expect(pushNotification({ window: "dzwonek", notificationId: "t-3", notification: { kind: "terminy", deadlines: [liability] } })).toMatchObject({
      title: "OC pojazdu Bus Ducato: termin 10.04.2026",
      body: "Dane pojazdu i dokumenty są na jego stronie.",
    });
    const tyres = { ...liability, id: "d4", kind: "wlasny" as const, name: "Wymiana opon", dueOn: "2026-03-09", overdue: true };
    expect(
      pushNotification({ window: "dzwonek", notificationId: "t-4", notification: { kind: "terminy", deadlines: [tyres, calibration] } }),
    ).toMatchObject({ body: "Bus Ducato: Wymiana opon, po terminie (9.03.2026) · N-01: kalibracja, termin 13.03.2026" });
  });
});

describe("powiadomienie push z wpisu okna 📋 zgłoszeń", () => {
  it("nowe zgłoszenie uszkodzenia: czego dotyczy, kto i co napisał, a kliknięcie otwiera zgłoszenie", () => {
    expect(
      pushNotification({
        window: "zgloszenia",
        entryId: "wpis-1",
        entry: {
          kind: "zgloszenie",
          issueId: "zgl-1",
          issue: { kind: "uszkodzenie", tool: { code: "W-02", name: "Wiertarka Makita" }, place: "Rataje" },
          author: "Marek Zieliński",
          text: "Nie trzyma udaru, iskrzy",
        },
      }),
    ).toEqual({
      title: "Nowe zgłoszenie: Uszkodzenie W-02 Wiertarka Makita",
      body: "Marek Zieliński: Nie trzyma udaru, iskrzy",
      url: "/zgloszenia/zgl-1/otworz",
      tag: "zgloszenia:wpis-1",
    });
  });

  it("komentarz i zamknięcie zgłoszenia lokalizacji", () => {
    const issue = { kind: "inne" as const, tool: null, place: "Rataje" };
    const comment = pushNotification({
      window: "zgloszenia",
      entryId: "wpis-2",
      entry: { kind: "komentarz", issueId: "zgl-2", issue, author: "Właściciel", text: "Zamówione" },
    });
    const closing = pushNotification({
      window: "zgloszenia",
      entryId: "wpis-3",
      entry: { kind: "zamkniecie", issueId: "zgl-2", issue, author: "Właściciel", text: "Są w kontenerze" },
    });
    expect([comment.title, closing.title]).toEqual(["Komentarz do zgłoszenia: Inne, Rataje", "Zgłoszenie zamknięte: Inne, Rataje"]);
    expect(closing).toMatchObject({ body: "Właściciel: Są w kontenerze", url: "/zgloszenia/zgl-2/otworz" });
  });

  it("zgłoszone narzędzie z budowy: kliknięcie otwiera je w oknie zgłoszeń", () => {
    expect(
      pushNotification({
        window: "zgloszenia",
        entryId: "wpis-4",
        entry: { kind: "zgloszenie_narzedzia", toolId: "t1", code: "M-03", name: "Młot Hilti", place: "Rataje", author: "Adam Nowak" },
      }),
    ).toEqual({
      title: "Zgłoszone narzędzie: M-03 Młot Hilti",
      body: "Adam Nowak, Rataje. Zaakceptuj je albo odrzuć w oknie zgłoszeń.",
      url: "/zgloszenia#narzedzie-t1",
      tag: "zgloszenia:wpis-4",
    });
  });
});

describe("powiadomienie push z odpowiedzi w oknie 💬 czatu", () => {
  it("tekst odpowiedzi supportu, a kliknięcie otwiera okno czatu", () => {
    expect(pushNotification({ window: "czat", messageId: "msg-1", reply: { text: "Budowę dodaje właściciel", photo: false } })).toEqual({
      title: "GP Engineering odpisuje na czacie",
      body: "Budowę dodaje właściciel",
      url: "/czat/otworz",
      tag: "czat:msg-1",
    });
  });

  it("samo zdjęcie", () => {
    expect(pushNotification({ window: "czat", messageId: "msg-2", reply: { text: "", photo: true } })).toMatchObject({ body: "📷 Zdjęcie" });
  });
});

describe("kanał Web Push", () => {
  it("wysyła zaszyfrowaną treść z kluczem VAPID serwera", async () => {
    const send = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));

    expect(await createWebPushChannel(vapid, send)(subscription, taken)).toBe("sent");

    expect(send).toHaveBeenCalledWith({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(pushNotification(taken)), expect.objectContaining({ vapidDetails: vapid }));
  });

  it.each([404, 410])("odpowiedź %i znaczy, że subskrypcja wygasła", async (statusCode) => {
    const send = vi.fn(async () => {
      throw new webpush.WebPushError("Gone", statusCode, {}, "", subscription.endpoint);
    });

    expect(await createWebPushChannel(vapid, send)(subscription, taken)).toBe("expired");
  });

  it("inne błędy usługi push zgłasza dalej, bez usuwania subskrypcji", async () => {
    const send = vi.fn(async () => {
      throw new webpush.WebPushError("Server error", 500, {}, "", subscription.endpoint);
    });

    await expect(createWebPushChannel(vapid, send)(subscription, taken)).rejects.toThrow("Server error");
  });
});
