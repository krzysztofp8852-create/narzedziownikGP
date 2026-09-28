import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import type { SearchTool } from "@/lib/tool-search";
import type { CatalogTool, ToolOnBoard } from "@/registry/registry";
import { ToolFinder } from "./tool-finder";

export const metadata: Metadata = { title: t("search.title") };

/**
 * Lupa w nagłówku: gdzie jest narzędzie, od ilu dni i kto za nie odpowiada, dla każdej roli. Lista to tablica
 * (także serwisy i zaginione) z kategorią, marką i modelem z ewidencji, bez wartości w zł. `?q=` wypełnia pole.
 */
export default async function SearchPage(props: PageProps<"/szukaj">) {
  const session = await requireSession();
  const { q } = await props.searchParams;
  const registry = getRegistry().as(session.userId);
  const [board, catalog] = await Promise.all([registry.whereIsWhat(), registry.toolCatalog()]);
  const details = new Map<string, CatalogTool>(catalog.map((tool) => [tool.id, tool]));

  const at =
    (place: SearchTool["place"], responsible: string | null) =>
    (tool: ToolOnBoard): SearchTool => ({
      id: tool.id,
      code: tool.code,
      name: tool.name,
      category: details.get(tool.id)?.category,
      brand: details.get(tool.id)?.brand,
      model: details.get(tool.id)?.model,
      place,
      daysInPlace: tool.daysInPlace,
      responsible,
      damaged: tool.damagedSince !== null,
      alarm: tool.alarm,
    });
  const tools: SearchTool[] = [
    ...board.base.tools.map(at({ name: board.base.name, kind: "baza" }, null)),
    ...board.sites.flatMap((site) => site.tools.map(at({ name: site.name, kind: "budowa" }, site.manager.fullName))),
    ...board.vehicles.flatMap((vehicle) => vehicle.tools.map(at({ name: vehicle.name, kind: "pojazd" }, vehicle.manager.fullName))),
    ...board.services.flatMap((service) => service.tools.map(at({ name: service.name, kind: "serwis" }, null))),
    ...board.lost.map((tool) => ({
      id: tool.id,
      code: tool.code,
      name: tool.name,
      place: { name: tool.lastLocation.name, kind: null },
      daysInPlace: tool.daysLost,
      responsible: tool.responsible,
      lost: true,
    })),
  ].sort((a, b) => a.code.localeCompare(b.code, "pl", { numeric: true }));

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("search.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("search.title")}</h1>
      <ToolFinder tools={tools} voice={voiceEntryEnabled()} initialQuery={typeof q === "string" ? q : ""} />
    </>
  );
}
