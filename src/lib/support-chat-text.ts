import { t } from "@/i18n/t";
import type { SupportReply } from "@/registry/registry";

/** Otwarcie okna 💬: odpowiedzi supportu stają się przeczytane. */
export const SUPPORT_CHAT_OPEN = "/czat/otworz";

/**
 * Ekran aplikacji z `?ekran=` do kontekstu wiadomości: tylko ścieżka w tej aplikacji, najwyżej 300 znaków; inaczej
 * null.
 */
export function screenFromQuery(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && value.length <= 300 ? value : null;
}

/** Otwarcie wątku w panelu super-admina: wiadomości użytkownika stają się przeczytane. */
export function supportThreadOpenLink(threadId: string): string {
  return `/super-admin/czat/${threadId}/otworz`;
}

/** Treść wiadomości w jednej linii (powiadomienie, lista wątków, temat e-maila); samo zdjęcie to „📷 Zdjęcie”. */
export function messagePreview(message: { text: string; photo: boolean }): string {
  return message.text.trim() ? message.text.replace(/\s+/g, " ").trim() : t("supportChat.photoOnly");
}

/** Odpowiedź supportu w powiadomieniu push. */
export function supportReplyText(reply: SupportReply): { title: string; body: string } {
  return { title: t("supportChat.push.title"), body: messagePreview(reply) };
}
