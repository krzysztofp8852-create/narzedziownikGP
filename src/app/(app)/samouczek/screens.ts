import type { Tutorial } from "@/registry/registry";

/** Rola, która dostaje samouczek ruchów zamiast pierwszych kroków właściciela. */
export type MovementRole = Exclude<Tutorial["role"], "wlasciciel">;

export type MovementScreen =
  | "introKierownik"
  | "introMagazynier"
  | "issue"
  | "return"
  | "transferKierownik"
  | "transferMagazynier"
  | "service"
  | "summary"
  | "undo"
  | "scan"
  | "voice"
  | "typing"
  | "finish";

/** Sposoby zapisu ruchu, które ta instalacja ma włączone (głos i tekst zależą od dostawcy interpretacji). */
export interface MovementEntry {
  textEntry: boolean;
  voiceEntry: boolean;
}

/** Ekrany samouczka ruchów po kolei; magazynier obsługuje bazę dla wszystkich budów, więc i serwis. */
export function movementScreens(role: MovementRole, { textEntry, voiceEntry }: MovementEntry): MovementScreen[] {
  return [
    role === "kierownik" ? "introKierownik" : "introMagazynier",
    "issue",
    "return",
    ...(role === "magazynier" ? (["service"] as const) : []),
    role === "kierownik" ? "transferKierownik" : "transferMagazynier",
    "summary",
    "undo",
    "scan",
    ...(textEntry ? ([voiceEntry ? "voice" : "typing"] as const) : []),
    "finish",
  ];
}
