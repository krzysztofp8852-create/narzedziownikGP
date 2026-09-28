import { randomUUID } from "node:crypto";
import type { EmailedNotification } from "../notifications";
import { type AuthAdmin, type Clock, type Db, EmailTakenError, type Notifier, type PhotoStore } from "../ports";
import type { PushMessage, PushSubscriptionData } from "../push";

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

  /** Adres konta logowania (u pracownika bez e-maila techniczny). */
  emailOf(userId: string) {
    return this.emails.get(userId);
  }

  /** Logowanie adresem i hasłem, jak w Supabase Auth: identyfikator konta albo null (złe dane, blokada). */
  signIn(email: string, password: string): string | null {
    const userId = [...this.emails].find(([, address]) => address === email.toLowerCase())?.[0];
    if (!userId || this.passwords.get(userId) !== password || this.blocked.has(userId)) return null;
    return userId;
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

/** Port powiadomień, który zapisuje, co i do kogo zostało wysłane. */
export class RecordingNotifier implements Notifier {
  /** Wysłane e-maile. */
  readonly sent: EmailedNotification[] = [];
  /** Wysłane kopie push, z przeglądarką, na którą poszły. */
  readonly pushed: { subscription: PushSubscriptionData; message: PushMessage }[] = [];
  /** Adresy subskrypcji, o których usługa push mówi, że wygasły. */
  readonly expired = new Set<string>();
  /** Kolejne wysyłki e-maili kończą się tym błędem, np. gdy dostawca e-maili nie działa. */
  failWith: Error | null = null;
  /** Kolejne wysyłki push kończą się tym błędem, np. gdy usługa push nie odpowiada. */
  pushFailWith: Error | null = null;

  async send(notification: EmailedNotification) {
    if (this.failWith) throw this.failWith;
    this.sent.push(notification);
  }

  async push(subscription: PushSubscriptionData, message: PushMessage) {
    if (this.pushFailWith) throw this.pushFailWith;
    if (this.expired.has(subscription.endpoint)) return "expired" as const;
    this.pushed.push({ subscription, message });
    return "sent" as const;
  }

  clear() {
    this.sent.length = 0;
    this.pushed.length = 0;
    this.expired.clear();
    this.failWith = null;
    this.pushFailWith = null;
  }
}

/** Kubełek zdjęć w pamięci. */
export class MemoryPhotoStore implements PhotoStore {
  readonly photos = new Map<string, Blob>();
  /** Kolejne zapisy kończą się tym błędem, np. gdy Storage nie odpowiada. */
  failWith: Error | null = null;

  async save(key: string, photo: Blob) {
    if (this.failWith) throw this.failWith;
    if (this.photos.has(key)) throw new Error(`Zdjęcie ${key} już jest`);
    this.photos.set(key, photo);
  }

  async read(key: string) {
    return this.photos.get(key) ?? null;
  }

  async remove(key: string) {
    this.photos.delete(key);
  }

  clear() {
    this.photos.clear();
    this.failWith = null;
  }
}
