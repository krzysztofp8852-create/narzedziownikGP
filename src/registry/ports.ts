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
  deleteUser(userId: string): Promise<void>;
}

/** Zdjęcie przesłane przez użytkownika. */
export interface Photo {
  bytes: Uint8Array;
  contentType: string;
}

/** Magazyn zdjęć narzędzi (prywatny, poza zasięgiem przeglądarki). */
export interface PhotoStore {
  put(path: string, photo: Photo): Promise<void>;
  remove(path: string): Promise<void>;
  /** Krótko ważny adres do wyświetlenia zdjęcia. */
  url(path: string): Promise<string>;
}

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`E-mail ${email} ma już konto`);
    this.name = "EmailTakenError";
  }
}

export const systemClock: Clock = { now: () => new Date() };
