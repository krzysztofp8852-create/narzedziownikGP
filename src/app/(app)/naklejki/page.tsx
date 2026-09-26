import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canPrintStickers } from "@/registry/registry";
import { StickerSheetForm } from "./sticker-forms";

export const metadata: Metadata = { title: t("stickers.title") };

/** Naklejki QR do wydruku: wszystkie nieoklejone albo wybrane narzędzia, na wybranym arkuszu A4. Tylko właściciel. */
export default async function StickersPage() {
  const session = await requireSession();
  if (!canPrintStickers(session)) redirect("/");
  const candidates = await getRegistry().as(session.userId).stickerCandidates();

  return (
    <>
      <p>
        <Link href="/ustawienia" className="muted">
          {t("stickers.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("stickers.title")}</h1>
      <p className="muted">{t("stickers.intro")}</p>
      <StickerSheetForm candidates={candidates} />
    </>
  );
}
