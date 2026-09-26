import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTools, canSeeValues } from "@/registry/registry";
import { editTool } from "../actions";
import { ToolForm } from "../tool-form";
import { loadToolCard } from "./load-tool-card";

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
export async function generateMetadata(props: PageProps<"/narzedzia/[id]">): Promise<Metadata> {
  const { card } = await loadToolCard((await props.params).id);
  return { title: card ? `${card.code} ${card.name}` : undefined };
}

export default async function ToolCardPage(props: PageProps<"/narzedzia/[id]">) {
  const { session, card } = await loadToolCard((await props.params).id);
  if (!card) notFound();
  const categories = canManageTools(session) ? await getRegistry().as(session.userId).categories() : [];

  const none = t("toolCard.none");
  const details: [label: string, value: string][] = [
    [t("tools.category"), card.category.name],
    [t("tools.brand"), card.brand ?? none],
    [t("tools.model"), card.model ?? none],
    [t("tools.serialNumber"), card.serialNumber ?? none],
    ...("value" in card ? [[t("tools.value"), card.value == null ? none : money.format(card.value)] as [string, string]] : []),
    [t("toolCard.state"), t("toolCard.stateValue", { state: t(`toolState.${card.state}`), registration: t(`toolRegistration.${card.registration}`) })],
  ];

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("toolCard.back")}
        </Link>
      </p>
      <div className="tool-card-head">
        <h1 className="display page-title">
          <span className="plate plate-large">{card.code}</span> {card.name}
        </h1>
      </div>

      <section className="location" aria-label={t("toolCard.location")}>
        <p>
          <span className="muted">{t("toolCard.location")}: </span>
          <strong>{t("toolCard.inPlace", { place: card.location.name, days: formatDays(card.daysInPlace) })}</strong>
        </p>
      </section>

      <section aria-labelledby="details">
        <h2 id="details" className="display section-title">
          {t("toolCard.details")}
        </h2>
        <dl className="details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {canManageTools(session) && (
        <details className="panel">
          <summary className="panel-summary">{t("toolCard.edit")}</summary>
          <ToolForm
            action={editTool.bind(null, card.id)}
            categories={categories}
            showValue={canSeeValues(session)}
            initial={{
              code: card.code,
              name: card.name,
              categoryId: card.category.id,
              brand: card.brand ?? "",
              model: card.model ?? "",
              serialNumber: card.serialNumber ?? "",
              value: card.value == null ? "" : String(card.value).replace(".", ","),
            }}
            submitLabel={t("tools.submitEdit")}
          />
        </details>
      )}

      <section aria-labelledby="history">
        <h2 id="history" className="display section-title">
          {t("toolCard.history")}
        </h2>
        <ol className="history">
          {card.history.map((entry, index) => (
            <li key={index}>
              <time dateTime={entry.occurredAt.toISOString()}>{formatDateTime(entry.occurredAt)}</time>
              <strong>{t(`movementKind.${entry.kind}`)}</strong>
              {entry.to && <span>{t("toolCard.movementTo", { place: entry.to })}</span>}
              <span className="muted">
                {t("toolCard.movementBy", { author: entry.author, source: t(`movementSource.${entry.source}`) })}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
