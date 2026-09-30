import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role, Session } from "./registry";

/** Jak samouczek się zamknął; bez tego startuje sam. */
export type TutorialOutcome = "ukonczony" | "pominiety";

export const TUTORIAL_OUTCOMES: readonly TutorialOutcome[] = ["ukonczony", "pominiety"];

/**
 * Pierwsze kroki właściciela, po kolei: budowa potrzebuje kierownika, a naklejka narzędzia. Krok kierownika jest zrobiony
 * także wtedy, gdy właściciel sam prowadzi budowę albo jeździ pojazdem: osobne konto kierownika nie jest mu potrzebne.
 */
export const FIRST_STEP_IDS = ["kierownik", "budowa", "narzedzia", "naklejki"] as const;

export type FirstStepId = (typeof FIRST_STEP_IDS)[number];

export interface FirstStep {
  id: FirstStepId;
  /** Ta rzecz już jest w firmie. */
  done: boolean;
}

export interface Tutorial {
  /** Właściciel dostaje pierwsze kroki, kierownik i magazynier samouczek zapisu ruchu. */
  role: Exclude<Role, "pracownik">;
  /** null: samouczek jeszcze się nie zamknął i startuje sam. */
  closed: TutorialOutcome | null;
  /** Pierwsze kroki właściciela ze stanem firmy; u kierownika i magazyniera pusta lista. */
  firstSteps: FirstStep[];
}

/**
 * Samouczek mają właściciel, kierownik i magazynier. Pracownik nie rejestruje ruchów, a firma demo ma własny
 * przewodnik po tablicy (i konto roli dzielą w niej wszyscy oglądający).
 */
export function hasTutorial(session: Session) {
  return session.role !== "pracownik" && !session.company.demo;
}

function requireTutorial(session: Session) {
  if (!hasTutorial(session)) throw new RegistryError("forbidden");
}

export async function tutorial(sql: Sql, session: Session): Promise<Tutorial | null> {
  if (!hasTutorial(session)) return null;
  const [{ tutorial: closed }] = await sql<{ tutorial: TutorialOutcome | null }>("select tutorial from app.users where user_id = $1", [
    session.userId,
  ]);
  return { role: session.role as Tutorial["role"], closed, firstSteps: session.role === "wlasciciel" ? await firstSteps(sql, session) : [] };
}

async function firstSteps(sql: Sql, session: Session): Promise<FirstStep[]> {
  const [row] = await sql<Record<FirstStepId, boolean>>(
    `select exists (select 1 from app.users where company_id = $1 and role = 'kierownik' and active)
              or exists (select 1 from app.locations l join app.users u on u.user_id = l.manager_id
                         where l.company_id = $1 and u.role = 'wlasciciel') as kierownik,
            exists (select 1 from app.locations where company_id = $1 and kind = 'budowa') as budowa,
            exists (select 1 from app.tools where company_id = $1) as narzedzia,
            exists (select 1 from app.tools where company_id = $1 and sticker_printed_at is not null) as naklejki`,
    [session.company.id],
  );
  return FIRST_STEP_IDS.map((id) => ({ id, done: row[id] }));
}

export async function closeTutorial(sql: Sql, session: Session, outcome: TutorialOutcome): Promise<void> {
  requireTutorial(session);
  if (!TUTORIAL_OUTCOMES.includes(outcome)) throw new RegistryError("invalid_input");
  await sql("update app.users set tutorial = $2 where user_id = $1", [session.userId, outcome]);
}
