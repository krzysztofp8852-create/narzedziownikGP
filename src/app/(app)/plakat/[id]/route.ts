import type { NextRequest } from "next/server";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import { posterPdf } from "@/posters/poster";
import { formatPosterCode, posterUrl } from "@/posters/url";
import { isRegistryError } from "@/registry/errors";

/**
 * PDF z plakatem budowy albo bazy (A4) do wydruku. Właściciel, a plakat budowy też jej kierownik. Druk niczego nie
 * zapisuje, więc działa także w trybie tylko do odczytu. Błąd to tekst do pokazania.
 */
export async function GET(request: NextRequest, context: RouteContext<"/plakat/[id]">) {
  const session = await requireSession();
  const { id } = await context.params;
  try {
    const poster = await getRegistry().as(session.userId).poster(id);
    const file = await posterPdf({
      companyName: poster.companyName,
      kindLabel: poster.place.kind === "baza" ? t("locationPage.baseKind") : t("locationPage.siteKind"),
      placeName: poster.place.name,
      address: poster.address,
      url: posterUrl(serverEnv.appUrl() ?? request.nextUrl.origin, poster.code),
      code: formatPosterCode(poster.code),
      texts: {
        heading: t("punches.posterHeading"),
        codeLabel: t("punches.posterCodeLabel"),
        instructions: [t("punches.posterStep1"), t("punches.posterStep2"), t("punches.posterStep3")],
      },
    });
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${t("punches.posterFileName")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(errorMessage(error), { status: isRegistryError(error) ? 400 : 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
