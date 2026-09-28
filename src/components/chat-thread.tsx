import type { ReactNode } from "react";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { SupportChatMessage, SupportSender } from "@/registry/registry";

/**
 * Wątek czatu z supportem jak w komunikatorze: wiadomości strony, która ogląda wątek (`mine`), po prawej, drugiej
 * strony po lewej, od najstarszej. Zdjęcie przychodzi z trasy z sesją (`photoUrl`).
 */
export function ChatThread<M extends SupportChatMessage>({
  messages,
  mine,
  senderName,
  photoUrl,
  details,
}: {
  messages: M[];
  mine: SupportSender;
  senderName: (message: M) => string;
  photoUrl: (message: M) => string;
  /** Dodatkowa linia pod wiadomością, np. kontekst w panelu super-admina. */
  details?: (message: M) => ReactNode;
}) {
  return (
    <ol className="chat-thread">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`chat-message ${message.sender === mine ? "chat-message-mine" : "chat-message-theirs"} chat-message-${message.sender}`}
          data-testid="chat-message"
        >
          <p className="chat-sender">{senderName(message)}</p>
          {message.text && <p className="chat-text">{message.text}</p>}
          {message.photo && (
            <a href={photoUrl(message)} target="_blank" rel="noopener">
              {/* Zdjęcie z własnej trasy z sesją; optymalizacja obrazów Next nie przeniesie ciasteczek. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="chat-photo" src={photoUrl(message)} alt={t("supportChat.photo")} />
            </a>
          )}
          <p className="chat-meta">
            <time dateTime={message.createdAt.toISOString()}>{formatDateTime(message.createdAt)}</time>
          </p>
          {details?.(message)}
        </li>
      ))}
    </ol>
  );
}
