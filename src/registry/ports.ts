import type { CallbackRequest } from "./callback-requests";
import type { EmailedNotification } from "./notifications";
import type { PushMessage, PushSubscriptionData } from "./push";
import type { UserMessage } from "./support-chat";

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

/**
 * Port powiadomień: kopia powiadomienia z dzwonka poza aplikacją, wysyłana po zapisie. Dwa kanały: e-mail
 * (tylko rodzaje z kopią e-mailową, `EmailedNotification`) i push (każdy nowy wpis, na każde urządzenie, na którym
 * adresat włączył powiadomienia: przez Web Push do przeglądarki, przez FCM do aplikacji na Androida). Do tego e-maile do GP Engineering: o nowej wiadomości użytkownika na czacie
 * i o prośbie o telefon z formularza na stronie.
 */
export interface Notifier {
  /** Kanał e-mail. */
  send(notification: EmailedNotification): Promise<void>;
  /**
   * Kanał push: kopia na jedno urządzenie, wysłana według rodzaju subskrypcji. `expired`, gdy usługa push odpowie,
   * że subskrypcja wygasła albo jej nie ma (token aplikacji nieważny albo wyrejestrowany); Rejestr ją wtedy usuwa.
   */
  push(subscription: PushSubscriptionData, message: PushMessage): Promise<"sent" | "expired">;
  /** E-mail na adres supportu GP Engineering (zna go adapter): nowa wiadomość użytkownika na czacie. */
  sendToSupport(message: UserMessage): Promise<void>;
  /** E-mail na ten sam adres GP Engineering: ktoś zostawił numer w formularzu „oddzwonimy”. */
  sendCallbackRequest(request: CallbackRequest): Promise<void>;
}

/**
 * Pliki w prywatnym kubełku (Supabase Storage): osobno zdjęcia zgłoszeń, zdjęcia czatu z supportem i dokumenty terminów
 * narzędzi (zdjęcia i PDF). Zapisuje i czyta je tylko serwer, a Rejestr pokazuje plik tylko temu, kto widzi zgłoszenie,
 * wątek czatu albo dokument.
 */
export interface PhotoStore {
  save(key: string, photo: Blob): Promise<void>;
  /** Zdjęcie albo null, gdy go nie ma. */
  read(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
}

/** Punkt na mapie: szerokość i długość geograficzna (WGS 84), w stopniach. */
export interface MapPosition {
  lat: number;
  lng: number;
}

/**
 * Geokodowanie: adres budowy albo bazy zamieniony na punkt na mapie, po stronie serwera. null, gdy dostawca
 * nie znalazł adresu; błąd, gdy nie odpowiedział (wtedy miejsce też zostaje bez położenia).
 */
export interface Geocoder {
  geocode(address: string): Promise<MapPosition | null>;
}

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`E-mail ${email} ma już konto`);
    this.name = "EmailTakenError";
  }
}

export const systemClock: Clock = { now: () => new Date() };

/** Bez dostawcy geokodowania żaden adres nie ma położenia; właściciel stawia pinezki ręcznie. */
export const noGeocoder: Geocoder = { geocode: async () => null };
