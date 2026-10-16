import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { navigation } from "@/lib/navigation";
import { getRegistry } from "@/lib/registry-instance";
import { screenFromQuery, SUPPORT_CHAT_OPEN, supportChatOpenLink } from "@/lib/support-chat-text";

export const generateMetadata = (): Metadata => ({ title: t("nav.help") });

/**
 * Pomoc: czat z obsługą (bez pracownika) i samouczek (bez pracownika i demo), który kierownikowi i magazynierowi
 * już nie startuje sam. Kto nie ma żadnej z tych rzeczy, wraca na tablicę. `?ekran=` (skąd otwarto Pomoc) idzie dalej
 * do czatu jako kontekst wiadomości.
 */
export default async function HelpPage(props: PageProps<"/pomoc">) {
  const session = await requireSession();
  const screen = screenFromQuery((await props.searchParams).ekran);
  const { help } = navigation(session);
  if (help.length === 0) redirect("/");
  const chat = help.includes("chat");
  const unread = chat ? await getRegistry().as(session.userId).unreadSupportReplyCount() : 0;
  return (
    <>
      <h1 className="display page-title">{t("nav.help")}</h1>
      <div className="company-grid">
        {chat && (
          <section className="company-card" aria-labelledby="help-chat">
            <h2 id="help-chat" className="display section-title">
              {t("supportChat.title")}
            </h2>
            <p className="muted">{t("supportChat.intro")}</p>
            {unread > 0 && (
              <p data-testid="help-chat-unread">
                <strong>{t("help.chat.unread", { count: unread })}</strong>
              </p>
            )}
            <p>
              {/* Zwykły odnośnik, a nie `Link`: otwarcie czyta odpowiedzi, więc nie może iść przy prefetchu. */}
              <a href={screen ? supportChatOpenLink(screen) : SUPPORT_CHAT_OPEN} className="button">
                {t("help.chat.open")}
              </a>
            </p>
          </section>
        )}
        {help.includes("tutorial") && (
          <section className="company-card" aria-labelledby="help-tutorial">
            <h2 id="help-tutorial" className="display section-title">
              {t("tutorial.title")}
            </h2>
            <p className="muted">{t(session.role === "wlasciciel" ? "help.tutorial.textOwner" : "help.tutorial.textMovements")}</p>
            <p>
              <Link href="/samouczek" className="button button-quiet">
                {t("help.tutorial.open")}
              </Link>
            </p>
          </section>
        )}
      </div>
    </>
  );
}
