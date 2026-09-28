import { randomUUID } from "node:crypto";
import { RegistryError } from "./errors";
import { type CheckedPhoto, checkPhoto } from "./photos";
import type { Sql } from "./ports";
import type { PushCopy } from "./push";
import type { Role, Session } from "./registry";
import { isUniqueViolation, ReplayedOperationError } from "./tools";
import { UUID_PATTERN } from "./validation";

export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;
/** Najwięcej wiadomości w oknie czatu i w wątku w panelu (najnowsze). */
const MAX_LISTED_MESSAGES = 300;
const MAX_SCREEN_LENGTH = 300;
const MAX_APP_VERSION_LENGTH = 100;

/** Kto napisał wiadomość: użytkownik, do którego należy wątek, support (GP Engineering) albo automatyczna odpowiedź. */
export type SupportSender = "uzytkownik" | "support" | "auto";

export interface SupportMessageInput {
  /** Identyfikator operacji klienta: ponowne wysłanie nie dubluje wiadomości. */
  operationId: string;
  /** Może być pusty, gdy jest zdjęcie. */
  text: string;
  /** Zdjęcie lub zrzut ekranu: JPG, PNG albo WEBP do 4 MB. */
  photo?: Blob | null;
  /** Ekran aplikacji, z którego użytkownik otworzył czat, np. `/narzedzia/…`. */
  screen?: string | null;
  /** Wersja aplikacji, którą użytkownik ma otwartą. */
  appVersion?: string | null;
}

export interface SupportReplyInput {
  /** Identyfikator operacji: ponowne wysłanie nie dubluje odpowiedzi. */
  operationId: string;
  /** Wątek, czyli jego użytkownik. */
  threadId: string;
  text: string;
  photo?: Blob | null;
}

/** Wiadomość w oknie 💬 użytkownika. */
export interface SupportChatMessage {
  id: string;
  sender: SupportSender;
  text: string;
  /** Czy do wiadomości jest zdjęcie. */
  photo: boolean;
  createdAt: Date;
}

/** Okno 💬 użytkownika: jego wątek od najstarszej wiadomości. */
export interface SupportChat {
  messages: SupportChatMessage[];
}

/** Kontekst wiadomości użytkownika z chwili pisania. */
export interface SupportMessageContext {
  role: Role;
  screen: string | null;
  appVersion: string | null;
}

/** Wiadomość w wątku w panelu super-admina; wiadomość użytkownika ma kontekst. */
export interface SupportThreadMessage extends SupportChatMessage {
  context: SupportMessageContext | null;
}

/** Wątek na liście w panelu super-admina. */
export interface SupportThreadSummary {
  /** Identyfikator wątku, czyli jego użytkownika. */
  id: string;
  company: { id: string; name: string };
  user: { fullName: string; role: Role; email: string | null; active: boolean };
  lastMessage: { sender: SupportSender; text: string; photo: boolean; createdAt: Date };
  /** Wiadomości użytkownika, których support jeszcze nie przeczytał. */
  unread: number;
}

export interface SupportThread extends SupportThreadSummary {
  /** Od najstarszej. */
  messages: SupportThreadMessage[];
}

/** Nowa wiadomość użytkownika dla supportu GP Engineering (kopia e-mail), z kontekstem. */
export interface UserMessage {
  messageId: string;
  threadId: string;
  company: { id: string; name: string };
  user: { fullName: string; role: Role; email: string | null };
  text: string;
  photo: boolean;
  screen: string | null;
  appVersion: string | null;
  sentAt: Date;
}

/** Odpowiedź supportu w kopii push dla użytkownika. */
export interface SupportReply {
  text: string;
  photo: boolean;
}

/** Czat mają właściciel, kierownik i magazynier; pracownik swoje sprawy zgłasza właścicielowi. */
export function canUseSupportChat(session: Pick<Session, "role">): boolean {
  return session.role !== "pracownik";
}

export function requireSupportChatUser(session: Session) {
  if (!canUseSupportChat(session)) throw new RegistryError("forbidden");
}

/** Treść wiadomości po sprawdzeniu: tekst (pusty, gdy jest samo zdjęcie) i zdjęcie. */
export interface MessageContent {
  text: string;
  photo: CheckedPhoto | null;
}

/** Sprawdzona treść wiadomości: tekst albo zdjęcie (albo oba). */
export async function checkMessage(input: { text: string; photo?: Blob | null }): Promise<MessageContent> {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length > MAX_SUPPORT_MESSAGE_LENGTH) throw new RegistryError("invalid_input");
  const photo = input.photo ? await checkPhoto(input.photo) : null;
  if (!text && !photo) throw new RegistryError("message_required");
  return { text, photo };
}

/**
 * Wiadomość użytkownika w jego wątku (zakłada wątek przy pierwszej). Baza dopisuje po niej automatyczną odpowiedź,
 * gdy od doby nie odpowiedzieliśmy. Użytkownik pisze w otwartym oknie czatu, więc widzi wszystko, co w nim jest:
 * wątek jest przeczytany. Zwraca klucz zdjęcia do zapisania i wiadomość dla supportu; przy ponowieniu nic.
 */
export async function sendMessage(
  sql: Sql,
  session: Session,
  input: SupportMessageInput,
  content: MessageContent,
  now: Date,
): Promise<{ photoKey: string | null; userMessage: UserMessage } | null> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  await sql("insert into app.support_threads (user_id, company_id, created_at) values ($1, $2, $3) on conflict (user_id) do nothing", [
    session.userId,
    session.company.id,
    now,
  ]);
  const context = {
    role: session.role,
    screen: optionalText(input.screen, MAX_SCREEN_LENGTH),
    appVersion: optionalText(input.appVersion, MAX_APP_VERSION_LENGTH),
  };
  const thread = { userId: session.userId, companyId: session.company.id };
  const sent = await insertMessage(sql, thread, { sender: "uzytkownik", authorId: session.userId, operationId: input.operationId, content, context }, now);
  if (!sent) return null;
  await markRead(sql, session.userId, "uzytkownik");

  const [user] = await sql<{ email: string | null }>("select email from app.users where user_id = $1", [session.userId]);
  return {
    photoKey: sent.photoKey,
    userMessage: {
      messageId: sent.messageId,
      threadId: session.userId,
      company: { id: session.company.id, name: session.company.name },
      user: { fullName: session.fullName, role: session.role, email: user?.email ?? null },
      text: content.text,
      photo: sent.photoKey !== null,
      screen: context.screen,
      appVersion: context.appVersion,
      sentAt: now,
    },
  };
}

/** Okno 💬 użytkownika: jego wątek (pusty, dopóki nie napisze). */
export async function chat(sql: Sql, session: Session): Promise<SupportChat> {
  const rows = await messageRows(sql, session.userId);
  return { messages: rows.map(toChatMessage) };
}

/** Odpowiedzi supportu, których użytkownik jeszcze nie przeczytał; automatyczne się nie liczą. */
export async function unreadReplyCount(sql: Sql, session: Session): Promise<number> {
  const [{ unread }] = await sql<{ unread: number }>(
    `select count(*)::int as unread from app.support_messages m join app.support_threads t on t.user_id = m.thread_id
     where m.thread_id = $1 and m.sender = 'support' and m.sequence_number > t.user_read_up_to`,
    [session.userId],
  );
  return unread;
}

/** Strona wątku (użytkownik albo support) przeczytała wszystko, co w nim jest. */
export async function markRead(sql: Sql, threadId: string, reader: "uzytkownik" | "support"): Promise<void> {
  if (!UUID_PATTERN.test(threadId)) return;
  const column = reader === "uzytkownik" ? "user_read_up_to" : "support_read_up_to";
  await sql(
    `update app.support_threads t set ${column} = greatest(t.${column}, coalesce(
       (select max(m.sequence_number) from app.support_messages m where m.thread_id = t.user_id), 0))
     where t.user_id = $1`,
    [threadId],
  );
}

/**
 * Odpowiedź supportu (super-admina `authorId`) w wątku użytkownika. Support pisze w otwartym wątku, więc wątek jest
 * przeczytany. Zwraca klucz zdjęcia do zapisania i kopię push dla użytkownika; przy ponowieniu nic.
 */
export async function reply(
  sql: Sql,
  authorId: string,
  input: SupportReplyInput,
  content: MessageContent,
  now: Date,
): Promise<{ photoKey: string | null; copy: PushCopy } | null> {
  if (!UUID_PATTERN.test(input.operationId)) throw new RegistryError("invalid_input");
  const [thread] = UUID_PATTERN.test(input.threadId)
    ? await sql<{ userId: string; companyId: string }>(
        'select user_id as "userId", company_id as "companyId" from app.support_threads where user_id = $1',
        [input.threadId],
      )
    : [];
  if (!thread) throw new RegistryError("not_found");
  const sent = await insertMessage(sql, thread, { sender: "support", authorId, operationId: input.operationId, content, context: null }, now);
  if (!sent) return null;
  await markRead(sql, thread.userId, "support");
  return {
    photoKey: sent.photoKey,
    copy: { recipientId: thread.userId, message: { window: "czat", messageId: sent.messageId, reply: { text: content.text, photo: sent.photoKey !== null } } },
  };
}

/**
 * Dopisuje wiadomość do wątku; null, gdy ta operacja już się zapisała. Wątek jest zablokowany do końca transakcji,
 * więc dwie wiadomości naraz nie dostaną obie automatycznej odpowiedzi.
 */
async function insertMessage(
  sql: Sql,
  thread: { userId: string; companyId: string },
  message: {
    sender: "uzytkownik" | "support";
    authorId: string;
    operationId: string;
    content: MessageContent;
    context: SupportMessageContext | null;
  },
  now: Date,
): Promise<{ messageId: string; photoKey: string | null } | null> {
  await sql("select 1 from app.support_threads where user_id = $1 for update", [thread.userId]);
  const [done] = await sql("select 1 from app.support_messages where thread_id = $1 and client_operation_id = $2", [
    thread.userId,
    message.operationId,
  ]);
  if (done) return null;
  const messageId = randomUUID();
  const { text, photo } = message.content;
  const photoKey = photo && `${thread.companyId}/${thread.userId}/${messageId}.${photo.extension}`;
  await sql(
    `insert into app.support_messages (id, thread_id, sender, author_id, body, photo_path, role, screen, app_version, created_at, client_operation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      messageId,
      thread.userId,
      message.sender,
      message.authorId,
      text,
      photoKey,
      message.context?.role ?? null,
      message.context?.screen ?? null,
      message.context?.appVersion ?? null,
      now,
      message.operationId,
    ],
  ).catch((error) => {
    throw isUniqueViolation(error, "support_messages_operation_per_thread") ? new ReplayedOperationError() : error;
  });
  return { messageId, photoKey };
}

/** Wątki ze wszystkich firm: z nieprzeczytanymi wiadomościami użytkownika na górze, potem od najnowszej wiadomości. */
export async function threads(sql: Sql): Promise<SupportThreadSummary[]> {
  return threadSummaries(sql, null);
}

/** Wątek z wiadomościami i kontekstem albo null, gdy go nie ma. */
export async function thread(sql: Sql, threadId: string): Promise<SupportThread | null> {
  if (!UUID_PATTERN.test(threadId)) return null;
  const [summary] = await threadSummaries(sql, threadId);
  if (!summary) return null;
  const rows = await messageRows(sql, threadId);
  return {
    ...summary,
    messages: rows.map((row) => ({
      ...toChatMessage(row),
      context: row.sender === "uzytkownik" && row.role ? { role: row.role, screen: row.screen, appVersion: row.app_version } : null,
    })),
  };
}

/** Ile wątków ma wiadomości użytkownika, których support jeszcze nie przeczytał (licznik w panelu). */
export async function unreadThreadCount(sql: Sql): Promise<number> {
  const [{ unread }] = await sql<{ unread: number }>(
    `select count(*)::int as unread from app.support_threads t
     where exists (select 1 from app.support_messages m
                   where m.thread_id = t.user_id and m.sender = 'uzytkownik' and m.sequence_number > t.support_read_up_to)`,
  );
  return unread;
}

async function threadSummaries(sql: Sql, threadId: string | null): Promise<SupportThreadSummary[]> {
  const rows = await sql<{
    id: string;
    company_id: string;
    company_name: string;
    full_name: string;
    role: Role;
    email: string | null;
    active: boolean;
    sender: SupportSender;
    body: string;
    photo: boolean;
    created_at: Date;
    unread: number;
  }>(
    `select * from (
       select t.user_id as id, c.id as company_id, c.name as company_name, u.full_name, u.role, u.email, u.active,
              last.sender, last.body, last.photo, last.created_at, last.sequence_number,
              (select count(*) from app.support_messages m
               where m.thread_id = t.user_id and m.sender = 'uzytkownik' and m.sequence_number > t.support_read_up_to)::int as unread
       from app.support_threads t
       join app.users u on u.user_id = t.user_id
       join app.companies c on c.id = t.company_id
       join lateral (
         select m.sender, m.body, m.photo_path is not null as photo, m.created_at, m.sequence_number
         from app.support_messages m where m.thread_id = t.user_id order by m.sequence_number desc limit 1
       ) last on true
       where $1::uuid is null or t.user_id = $1::uuid
     ) listed
     order by unread > 0 desc, sequence_number desc`,
    [threadId],
  );
  return rows.map((row) => ({
    id: row.id,
    company: { id: row.company_id, name: row.company_name },
    user: { fullName: row.full_name, role: row.role, email: row.email, active: row.active },
    lastMessage: { sender: row.sender, text: row.body, photo: row.photo, createdAt: new Date(row.created_at) },
    unread: row.unread,
  }));
}

/** Klucz zdjęcia wiadomości z wątku, który aktor widzi (RLS: własny albo każdy dla super-admina). */
export async function visiblePhotoKey(sql: Sql, messageId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(messageId)) return null;
  const [row] = await sql<{ photo_path: string | null }>("select photo_path from app.support_messages where id = $1", [messageId]);
  return row?.photo_path ?? null;
}

interface MessageRow {
  id: string;
  sender: SupportSender;
  body: string;
  photo: boolean;
  role: Role | null;
  screen: string | null;
  app_version: string | null;
  created_at: Date;
}

/** Najnowsze wiadomości wątku, od najstarszej. */
async function messageRows(sql: Sql, threadId: string): Promise<MessageRow[]> {
  return sql<MessageRow>(
    `select * from (
       select id, sender, body, photo_path is not null as photo, role, screen, app_version, created_at, sequence_number
       from app.support_messages where thread_id = $1 order by sequence_number desc limit $2
     ) newest order by sequence_number`,
    [threadId, MAX_LISTED_MESSAGES],
  );
}

function toChatMessage(row: MessageRow): SupportChatMessage {
  return { id: row.id, sender: row.sender, text: row.body, photo: row.photo, createdAt: new Date(row.created_at) };
}

function optionalText(raw: string | null | undefined, maxLength: number): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}
