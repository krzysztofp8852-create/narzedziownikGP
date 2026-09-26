/** Parametryzowane zapytanie SQL w ramach jednej transakcji. */
export type Sql = <Row = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<Row[]>;

/** Połączenie z Postgresem, na którym działa Rejestr. */
export interface Db {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

/** Konta logowania (Supabase Auth), zarządzane po stronie serwera. */
export interface AuthAdmin {
  /** Zakłada konto z potwierdzonym e-mailem. Rzuca EmailTakenError, gdy e-mail jest zajęty. */
  createUser(input: { email: string; password: string }): Promise<{ userId: string }>;
  setPassword(userId: string, password: string): Promise<void>;
  /** Blokuje logowanie i odświeżanie sesji tego konta (dezaktywacja). */
  blockSignIn(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`E-mail ${email} ma już konto`);
    this.name = "EmailTakenError";
  }
}

export const systemClock: Clock = { now: () => new Date() };
