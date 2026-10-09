import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdleStatus } from "@/registry/registry";
import { ACTIVITY_PING_MS, idleTab, OFFLINE_RETRY_MS } from "./idle-tab";

const MINUTE = 60_000;

/** Karta z serwerem, który odpowiada `answer` (null: brak sieci), i zapisem pytań: `ping` albo `check`. */
function givenTab(options: { minutes: number; remainingMs: number }, answer: (activity: boolean) => IdleStatus | null) {
  const asked: string[] = [];
  const left = vi.fn();
  const tab = idleTab(
    {
      ask: async (activity) => (asked.push(activity ? "ping" : "check"), answer(activity)),
      leave: left,
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    },
    options,
  );
  return { tab, asked, left };
}

describe("wylogowanie po bezczynności w otwartej karcie", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("zgłasza aktywność od razu, a potem najwyżej raz na minutę, także tę z końca minuty", async () => {
    const { tab, asked } = givenTab({ minutes: 30, remainingMs: 30 * MINUTE }, () => ({ kind: "active", remainingMs: 30 * MINUTE }));

    tab.activity();
    await vi.advanceTimersByTimeAsync(10_000);
    tab.activity();
    tab.activity();
    expect(asked).toEqual(["ping"]);

    await vi.advanceTimersByTimeAsync(ACTIVITY_PING_MS);
    expect(asked).toEqual(["ping", "ping"]);
    await vi.advanceTimersByTimeAsync(5 * ACTIVITY_PING_MS);
    expect(asked).toEqual(["ping", "ping"]);
    tab.stop();
  });

  it("gdy minie czas, pyta serwer i wychodzi, jeśli sesja wygasła", async () => {
    const { tab, asked, left } = givenTab({ minutes: 15, remainingMs: 15 * MINUTE }, () => ({ kind: "expired" }));

    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1);
    expect(left).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(asked).toEqual(["check"]);
    expect(left).toHaveBeenCalledOnce();
    tab.stop();
  });

  it("zostaje, gdy w innej karcie ktoś był aktywny, i pyta znowu, gdy minie nowy czas", async () => {
    const answers: IdleStatus[] = [{ kind: "active", remainingMs: 10 * MINUTE }, { kind: "expired" }];
    const { tab, asked, left } = givenTab({ minutes: 15, remainingMs: 15 * MINUTE }, () => answers.shift()!);

    await vi.advanceTimersByTimeAsync(16 * MINUTE);
    expect(left).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(asked).toEqual(["check", "check"]);
    expect(left).toHaveBeenCalledOnce();
    tab.stop();
  });

  it("wychodzi od razu, gdy serwer na aktywność odpowie, że sesja wygasła", async () => {
    const { tab, left } = givenTab({ minutes: 15, remainingMs: 15 * MINUTE }, () => ({ kind: "expired" }));

    tab.activity();
    await vi.advanceTimersByTimeAsync(0);

    expect(left).toHaveBeenCalledOnce();
    tab.stop();
  });

  it("bez sieci wychodzi dopiero, gdy w tej karcie nikt nic nie robił przez cały czas", async () => {
    const { tab, left } = givenTab({ minutes: 15, remainingMs: 15 * MINUTE }, () => null);

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    tab.activity();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(left).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * MINUTE + OFFLINE_RETRY_MS);

    expect(left).toHaveBeenCalledOnce();
    tab.stop();
  });

  it("przestaje, gdy wylogowanie po bezczynności wyłączono", async () => {
    const { tab, asked } = givenTab({ minutes: 15, remainingMs: 15 * MINUTE }, () => ({ kind: "off" }));

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(asked).toEqual(["check"]);
    tab.stop();
  });
});
