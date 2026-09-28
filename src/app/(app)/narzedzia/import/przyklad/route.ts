import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { sampleImportFile } from "@/import/sample";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canImportTools } from "@/registry/registry";

/** Przykładowy plik XLSX do importu, z kategoriami i lokalizacjami tej firmy. Tylko właściciel. */
export async function GET() {
  const session = await requireSession();
  if (!canImportTools(session)) redirect("/");
  const registry = getRegistry().as(session.userId);
  const [categories, locations] = await Promise.all([registry.categories(), registry.locations()]);
  const file = await sampleImportFile({
    categories,
    base: locations.base.name,
    sites: locations.sites.filter((site) => site.status === "aktywna").map((site) => site.name),
  });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${t("import.sample.fileName")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
