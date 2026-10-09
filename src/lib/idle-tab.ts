// Wylogowanie po bezczynności w otwartej karcie (ADR 0044): bez Reacta, żeby dało się je sprawdzić z udawanym zegarem.
import type { IdleStatus } from "@/registry/registry";

/** Ścieżka, która wylogowuje przeglądarkę po bezczynności (src/app/wylogowanie/route.ts). */
export const IDLE_SIGN_OUT_PATH = "/wylogowanie";

/** Aktywność w karcie zgłaszamy serwerowi najwyżej raz na tyle. */
export const ACTIVITY_PING_MS = 60_000;
/** Bez odpowiedzi serwera (brak sieci) pytamy znowu po tylu. */
export const OFFLINE_RETRY_MS = 60_000;
/** Pytamy chwilę po czasie od serwera, żeby jego zegar na pewno uznał sesję za wygasłą. */
const CHECK_MARGIN_MS = 2_000;

export interface IdleTabDeps {
  /** Pytanie do serwera: `activity` to zgłoszenie aktywności, inaczej samo sprawdzenie; null bez odpowiedzi. */
  ask(activity: boolean): Promise<IdleStatus | null>;
  /** Wyjście z karty do wylogowania. */
  leave(): void;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/**
 * Karta właściciela z wylogowaniem po `minutes` minutach bezczynności; serwer właśnie powiedział, że sesja wygaśnie za
 * `remainingMs`. Gdy ten czas minie, karta pyta serwer (aktywność w innej karcie też odsuwa wylogowanie) i wychodzi,
 * gdy sesja wygasła. Bez sieci wychodzi, gdy w tej karcie nikt nic nie robił przez cały czas, żeby nie zostawić
 * danych na ekranie; wylogowanie na serwerze nastąpi przy pierwszym kroku z siecią.
 */
export function idleTab(deps: IdleTabDeps, { minutes, remainingMs }: { minutes: number; remainingMs: number }) {
  let lastInteraction = deps.now();
  let lastPing = Number.NEGATIVE_INFINITY;
  let check: unknown = null;
  let trailingPing: unknown = null;
  let done = false;

  const scheduleCheck = (ms: number) => {
    deps.clearTimeout(check);
    check = deps.setTimeout(() => void ask(false), ms);
  };

  const handle = (status: IdleStatus | null) => {
    if (done) return;
    if (status === null) {
      if (deps.now() - lastInteraction >= minutes * 60_000) leave();
      else scheduleCheck(OFFLINE_RETRY_MS);
    } else if (status.kind === "active") scheduleCheck(status.remainingMs + CHECK_MARGIN_MS);
    else if (status.kind === "expired") leave();
    else stop();
  };

  const ask = (activity: boolean) => deps.ask(activity).then(handle, () => handle(null));

  const ping = () => {
    trailingPing = null;
    lastPing = deps.now();
    void ask(true);
  };

  const stop = () => {
    done = true;
    deps.clearTimeout(check);
    deps.clearTimeout(trailingPing);
  };

  const leave = () => {
    stop();
    deps.leave();
  };

  scheduleCheck(remainingMs + CHECK_MARGIN_MS);

  return {
    /** Ktoś coś zrobił w karcie (mysz, klawiatura, dotyk, przewijanie). */
    activity() {
      if (done) return;
      lastInteraction = deps.now();
      const sincePing = lastInteraction - lastPing;
      if (sincePing >= ACTIVITY_PING_MS) ping();
      else if (trailingPing === null) trailingPing = deps.setTimeout(ping, ACTIVITY_PING_MS - sincePing);
    },
    /** Karta wróciła na ekran (np. po uśpieniu komputera): sprawdzamy od razu. */
    check() {
      if (!done) void ask(false);
    },
    stop,
  };
}
