import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { formatDateTime } from "@/i18n/dates";
import { conflictText, movementRoute } from "@/i18n/movement-text";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { resolveRejectedMovement } from "./actions";

export const metadata: Metadata = { title: t("toClarify.title") };

/** Lista „Do wyjaśnienia”: ruchy z kolejki offline, których serwer nie przyjął, z powodem odrzucenia. */
export default async function ToClarifyPage() {
  const session = await requireSession();
  const rejections = await getRegistry().as(session.userId).movementsToClarify();

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("toClarify.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("toClarify.title")}</h1>
      <p className="muted">{t("toClarify.intro")}</p>
      {rejections.length === 0 ? (
        <p className="empty">{t("toClarify.empty")}</p>
      ) : (
        <ol className="movements bell-list" aria-label={t("toClarify.title")}>
          {rejections.map((rejection) => (
            <li key={rejection.id} className="movement">
              <div className="movement-head">
                <span className={`movement-kind movement-kind-${rejection.kind}`}>{t(`movementKind.${rejection.kind}`)}</span>
                <span>{movementRoute(rejection.from?.name ?? null, rejection.to?.name ?? null)}</span>
              </div>
              <p className="movement-tools">
                {rejection.tools.map((tool, index) => (
                  <Fragment key={tool.id}>
                    {index > 0 && ", "}
                    <Link href={`/narzedzia/${tool.id}`} title={tool.name}>
                      {tool.code}
                    </Link>
                  </Fragment>
                ))}
              </p>
              <div className="form-error">
                <p>{t(`errors.${rejection.reason}`)}</p>
                {rejection.conflicts.length > 0 && (
                  <ul>
                    {rejection.conflicts.map((conflict) => (
                      <li key={conflict.toolId}>{conflictText(conflict)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="muted movement-meta">
                {t("toClarify.when", { recorded: formatDateTime(rejection.occurredAt), rejected: formatDateTime(rejection.rejectedAt) })}
              </p>
              <form action={resolveRejectedMovement.bind(null, rejection.id)} className="undo">
                <button className="button button-quiet button-small" type="submit">
                  {t("toClarify.resolve")}
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
