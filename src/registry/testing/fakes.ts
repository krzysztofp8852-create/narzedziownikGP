import { randomUUID } from "node:crypto";
import { type AuthAdmin, type Clock, type Db, EmailTakenError } from "../ports";

/** Zegar ustawiany ręcznie. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(at: Date | string) {
    this.current = new Date(at);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/**
 * AuthAdmin zapisujący konta w auth.users tej samej bazy (żeby działały klucze
 * obce) i pamiętający hasła, żeby test mógł sprawdzić, jakim hasłem się zalogujemy.
 */
export class FakeAuthAdmin implements AuthAdmin {
  private passwords = new Map<string, string>();
  private emails = new Map<string, string>();
  private blocked = new Set<string>();

  constructor(private db: Db) {}

  async createUser({ email, password }: { email: string; password: string }) {
    const normalized = email.toLowerCase();
    if ([...this.emails.values()].includes(normalized)) throw new EmailTakenError(email);
    const userId = randomUUID();
    await this.db.transaction((sql) => sql("insert into auth.users (id, email) values ($1, $2)", [userId, normalized]));
    this.emails.set(userId, normalized);
    this.passwords.set(userId, password);
    return { userId };
  }

  async setPassword(userId: string, password: string) {
    if (!this.passwords.has(userId)) throw new Error(`Brak konta ${userId}`);
    this.passwords.set(userId, password);
  }

  async blockSignIn(userId: string) {
    if (!this.passwords.has(userId)) throw new Error(`Brak konta ${userId}`);
    this.blocked.add(userId);
  }

  async deleteUser(userId: string) {
    await this.db.transaction((sql) => sql("delete from auth.users where id = $1", [userId]));
    this.passwords.delete(userId);
    this.emails.delete(userId);
    this.blocked.delete(userId);
  }

  /** Hasło, którym dana osoba zalogowałaby się teraz. */
  passwordOf(userId: string) {
    return this.passwords.get(userId);
  }

  /** Czy logowanie tego konta jest zablokowane. */
  isBlocked(userId: string) {
    return this.blocked.has(userId);
  }

  accountCount() {
    return this.passwords.size;
  }

  clear() {
    this.passwords.clear();
    this.emails.clear();
    this.blocked.clear();
  }
}
