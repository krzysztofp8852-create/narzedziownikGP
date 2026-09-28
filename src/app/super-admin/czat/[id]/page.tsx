import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ChatMessageForm } from "@/components/chat-message-form";
import { ChatThread } from "@/components/chat-thread";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { MAX_SUPPORT_MESSAGE_LENGTH, type SupportThreadMessage } from "@/registry/registry";
import { replyToSupportThread } from "../../actions";

export const metadata: Metadata = { title: t("supportChat.admin.title") };

/** Wątek użytkownika z kontekstem każdej jego wiadomości (rola, ekran, wersja aplikacji) i odpowiedzią GP Engineering. */
export default async function SupportThreadPage(props: PageProps<"/super-admin/czat/[id]">) {
  const { id } = await props.params;
  const thread = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .supportThread(id);

  const back = (
    <p>
      <Link href="/super-admin/czat" className="muted">
        {t("supportChat.admin.back")}
      </Link>
    </p>
  );
  if (!thread) {
    return (
      <>
        {back}
        <p className="empty">{t("errors.not_found")}</p>
      </>
    );
  }

  const none = t("supportChat.email.none");
  const context = (message: SupportThreadMessage) =>
    message.context && (
      <p className="chat-meta chat-context" data-testid="chat-context">
        {t("supportChat.admin.context", {
          role: t(`roles.${message.context.role}`),
          screen: message.context.screen ?? none,
          version: message.context.appVersion ?? none,
        })}
      </p>
    );

  return (
    <>
      {back}
      <h1 className="display page-title">
        {thread.user.fullName} · {thread.company.name}
      </h1>
      <dl className="details">
        <div>
          <dt>{t("supportChat.admin.company")}</dt>
          <dd>
            <Link href={`/super-admin/firmy/${thread.company.id}`}>{thread.company.name}</Link>
          </dd>
        </div>
        <div>
          <dt>{t("supportChat.admin.role")}</dt>
          <dd>
            {t(`roles.${thread.user.role}`)}
            {!thread.user.active && ` · ${t("supportChat.admin.inactive")}`}
          </dd>
        </div>
        <div>
          <dt>{t("supportChat.admin.email")}</dt>
          <dd>{thread.user.email ?? none}</dd>
        </div>
      </dl>
      <section className="chat" aria-label={t("supportChat.admin.title")}>
        <ChatThread
          messages={thread.messages}
          mine="support"
          senderName={(message) => (message.sender === "uzytkownik" ? thread.user.fullName : t(`supportChat.sender.${message.sender}`))}
          photoUrl={(message) => `/super-admin/czat/zdjecie/${message.id}`}
          details={context}
        />
        <ChatMessageForm
          action={replyToSupportThread.bind(null, thread.id)}
          operationId={randomUUID()}
          label={t("supportChat.admin.replyLabel")}
          placeholder={t("supportChat.admin.replyPlaceholder")}
          submit={t("supportChat.admin.submit")}
          maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
        />
      </section>
    </>
  );
}
