import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { ISSUE_KINDS, type IssueKind, MAX_ISSUE_TEXT_LENGTH } from "@/registry/registry";
import { IssueForm } from "./issue-form";

export const metadata: Metadata = { title: t("issues.new") };

/**
 * Nowe zgłoszenie. `?narzedzie=<id>&rodzaj=uszkodzenie` (przycisk „Zgłoś uszkodzenie” na karcie narzędzia)
 * wypełnia narzędzie i rodzaj.
 */
export default async function NewIssuePage(props: PageProps<"/zgloszenia/nowe">) {
  const session = await requireSession();
  const { narzedzie, rodzaj } = await props.searchParams;
  const registry = getRegistry().as(session.userId);
  const [catalog, { base, sites, vehicles, services }] = await Promise.all([registry.toolCatalog(), registry.locations()]);
  const kind: IssueKind = ISSUE_KINDS.includes(rodzaj as IssueKind) ? (rodzaj as IssueKind) : "uszkodzenie";
  const toolId = typeof narzedzie === "string" && catalog.some((tool) => tool.id === narzedzie) ? narzedzie : null;

  return (
    <>
      <p>
        <Link href={toolId ? `/narzedzia/${toolId}` : "/zgloszenia"} className="muted">
          {toolId ? t("toolCard.back") : t("issues.backToList")}
        </Link>
      </p>
      <h1 className="display page-title">{t("issues.new")}</h1>
      <IssueForm
        operationId={randomUUID()}
        tools={catalog.map((tool) => ({ id: tool.id, code: tool.code, name: tool.name, place: tool.location.name }))}
        places={[
          base,
          ...sites.filter((site) => site.status === "aktywna"),
          ...vehicles.filter((vehicle) => vehicle.active),
          ...services,
        ].map(({ id, name }) => ({ id, name }))}
        kind={kind}
        toolId={toolId}
        maxLength={MAX_ISSUE_TEXT_LENGTH}
      />
    </>
  );
}
