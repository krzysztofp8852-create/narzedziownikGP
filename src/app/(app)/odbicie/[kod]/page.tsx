import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import type { PunchPreview } from "@/registry/registry";
import { PunchFlow } from "./punch-flow";

export const metadata: Metadata = { title: t("punches.title") };

/**
 * Strona odbicia z adresu w kodzie QR plakatu (niezalogowany wraca tu po logowaniu). Nieważny kod (stary plakat
 * po „Nowy kod”, plakat innej firmy) i zakończona budowa kończą się komunikatem.
 */
export default async function PunchPage(props: PageProps<"/odbicie/[kod]">) {
  const session = await requireSession();
  const { kod } = await props.params;
  let preview: PunchPreview | null = null;
  let refused: string | null = null;
  try {
    preview = await getRegistry().as(session.userId).punchPreview(kod);
  } catch (error) {
    if (!isRegistryError(error) || (error.code !== "poster_invalid" && error.code !== "site_finished")) throw error;
    refused = errorMessage(error);
  }

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("locationPage.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("punches.title")}</h1>
      {preview ? (
        // Każde otwarcie strony to nowe odbicie; ponowne wysłanie z tej samej strony idzie pod tym samym identyfikatorem.
        <PunchFlow userId={session.userId} code={kod} preview={preview} operationId={randomUUID()} />
      ) : (
        <p className="form-error" role="alert">
          {refused}
        </p>
      )}
    </>
  );
}
