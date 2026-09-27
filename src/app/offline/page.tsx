import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";

export const metadata: Metadata = { title: t("offline.pageTitle") };

/**
 * Strona, którą service worker pokazuje bez zasięgu zamiast stron spoza tablicy (ADR 0010). Statyczna i bez
 * sesji, bo leży w telefonie od instalacji service workera.
 */
export default function OfflinePage() {
  return (
    <AuthShell title={t("offline.pageTitle")}>
      <p>{t("offline.pageText")}</p>
      <p>
        {/* Zwykły odnośnik: pełne otwarcie tablicy przechodzi przez service worker, który ma jej kopię. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button" href="/">
          {t("offline.pageBoard")}
        </a>
      </p>
    </AuthShell>
  );
}
