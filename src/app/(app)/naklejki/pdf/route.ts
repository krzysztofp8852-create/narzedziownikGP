import type { NextRequest } from "next/server";
import { formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import type { StickerSelection } from "@/registry/registry";
import { isStickerLayout, isStickerPosition } from "@/stickers/layouts";
import { stickerSheetPdf } from "@/stickers/sheet";
import { stickerUrl } from "@/stickers/url";

/**
 * PDF z naklejkami QR do wydruku: wszystkie nieoklejone (`selection=unlabeled`) albo zaznaczone
 * narzędzia (`toolId`, może się powtarzać), na arkuszu `layout` od miejsca `firstPosition`.
 * Druk zapisuje się w Rejestrze, więc wydrukowane przestają być nieoklejone. Tylko właściciel.
 * Błąd to JSON `{ error }` z komunikatem do pokazania.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession();
  const form = await request.formData();
  const layout = formText(form, "layout");
  const firstPosition = Number(formText(form, "firstPosition") || 1);
  if (!isStickerLayout(layout) || !isStickerPosition(layout, firstPosition)) {
    return Response.json({ error: t("errors.invalid_input") }, { status: 400 });
  }
  const selection: StickerSelection =
    formText(form, "selection") === "unlabeled"
      ? { unlabeled: true }
      : { toolIds: form.getAll("toolId").filter((id) => typeof id === "string") };

  const appUrl = serverEnv.appUrl() ?? request.nextUrl.origin;
  try {
    // Plik powstaje w transakcji druku: gdy się nie uda, narzędzia zostają nieoklejone.
    const sheet = await getRegistry()
      .as(session.userId)
      .printStickers(selection, async (batch) => ({
        batch,
        file: await stickerSheetPdf({
          companyName: batch.companyName,
          stickers: batch.stickers.map(({ toolId, code }) => ({ code, url: stickerUrl(appUrl, toolId) })),
          layout,
          firstPosition,
        }),
      }));
    return new Response(new Uint8Array(sheet.file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${t("stickers.fileName", { day: formatDay(sheet.batch.printedAt) })}"`,
        "Cache-Control": "private, no-store",
        "X-Sticker-Count": String(sheet.batch.stickers.length),
      },
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: isRegistryError(error) ? 400 : 500 });
  }
}
