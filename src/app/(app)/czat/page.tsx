import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChatMessageForm } from "@/components/chat-message-form";
import { ChatThread } from "@/components/chat-thread";
import { SalesContact } from "@/components/sales-contact";
import { formatPhone, phoneHref } from "@/i18n/phone";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";
import { screenFromQuery } from "@/lib/support-chat-text";
import { canUseSupportChat, MAX_SUPPORT_MESSAGE_LENGTH } from "@/registry/registry";
import { sendSupportMessage } from "./actions";

export const metadata: Metadata = { title: t("supportChat.title") };

/**
 * Okno 💬: rozmowa z GP Engineering jak w komunikatorze, z numerem telefonu do supportu w stopce. `?ekran=`
 * (ekran, z którego użytkownik otworzył czat) i wersja aplikacji idą z każdą wiadomością jako kontekst. Działa
 * także w trybie tylko do odczytu. W firmie demo zamiast wspólnego wątku jest informacja i kontakt handlowy.
 */
export default async function SupportChatPage(props: PageProps<"/czat">) {
  const session = await requireSession();
  if (!canUseSupportChat(session)) redirect("/");
  if (session.company.demo) return <DemoChat />;
  const { ekran } = await props.searchParams;
  const { messages } = await getRegistry().as(session.userId).supportChat();
  const phone = serverEnv.supportPhone();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("supportChat.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("supportChat.title")}</h1>
      <p className="muted">{t("supportChat.intro")}</p>
      <section className="chat" aria-label={t("supportChat.title")}>
        {messages.length === 0 ? (
          <p className="empty">{t("supportChat.empty")}</p>
        ) : (
          <ChatThread
            messages={messages}
            mine="uzytkownik"
            senderName={(message) => t(`supportChat.sender.${message.sender}`)}
            photoUrl={(message) => `/czat/zdjecie/${message.id}`}
          />
        )}
        <ChatMessageForm
          action={sendSupportMessage}
          operationId={randomUUID()}
          hidden={{ screen: screenFromQuery(ekran) ?? "", appVersion: serverEnv.appVersion() }}
          label={t("supportChat.form.label")}
          placeholder={t("supportChat.form.placeholder")}
          submit={t("supportChat.form.submit")}
          maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
        />
        {phone && (
          <footer className="chat-footer">
            <p>
              {t("supportChat.phone")} <a href={phoneHref(phone)}>{formatPhone(phone)}</a>
            </p>
          </footer>
        )}
      </section>
    </>
  );
}

/**
 * Okno 💬 w firmie demo: konto roli dzielą wszyscy oglądający, więc wspólny wątek pokazałby następnemu wiadomości
 * poprzedniego (np. jego telefon). Zamiast niego mówimy, jak czat działa u klienta, i podajemy kontakt handlowy.
 */
function DemoChat() {
  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("supportChat.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("supportChat.title")}</h1>
      <section className="chat" aria-label={t("supportChat.title")} data-testid="demo-chat">
        <p>{t("supportChat.demo.text")}</p>
        <div className="demo-contact">
          <p>{t("supportChat.demo.contact")}</p>
          <SalesContact />
        </div>
      </section>
    </>
  );
}
