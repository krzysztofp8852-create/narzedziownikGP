import type { Metadata } from "next";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { formatPhone } from "@/registry/registry";

export const metadata: Metadata = { title: t("superAdmin.callbacks.title") };

/** Prośby o telefon z formularza „Zostaw numer, oddzwonimy” z ostatnich 90 dni, od najnowszej, z licznikami. */
export default async function CallbackRequestsPage() {
  const { requests, counts } = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .callbackRequests();

  return (
    <>
      <h1 className="display page-title">{t("superAdmin.callbacks.title")}</h1>
      <p className="muted">{t("superAdmin.callbacks.intro")}</p>
      {requests.length === 0 ? (
        <p className="empty">{t("superAdmin.callbacks.empty")}</p>
      ) : (
        <>
          <p className="callback-summary" data-testid="callback-summary">
            {t("superAdmin.callbacks.summary", counts)}
          </p>
          <ol className="movements" data-testid="callback-requests">
            {requests.map((request) => (
              <li key={request.id} className="movement" data-testid="callback-request">
                <span className="movement-head">
                  <a href={`tel:${request.phone}`}>{formatPhone(request.phone)}</a>
                  <span>{request.name ?? <span className="muted">{t("superAdmin.callbacks.noName")}</span>}</span>
                </span>
                <span className="muted movement-meta">
                  <time dateTime={request.at.toISOString()}>{formatDateTime(request.at)}</time>
                  {" · "}
                  {t(`superAdmin.callbacks.sources.${request.source}`)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
