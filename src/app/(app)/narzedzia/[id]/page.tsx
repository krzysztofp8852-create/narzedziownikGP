import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DamagedIcon } from "@/components/damaged-icon";
import { movementRoute, stateChangeText } from "@/i18n/movement-text";
import { formatDateTime } from "@/i18n/dates";
import { formatDays } from "@/i18n/days";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { nextDeadlineText } from "@/lib/deadline-text";
import { historySearch } from "@/lib/history-filters";
import { damagedAgo } from "@/lib/issue-text";
import { getRegistry } from "@/lib/registry-instance";
import { canCorrectTools, canManageTools, canPrintStickers, canSeeCosts, canSeeValues, type EffectiveRate } from "@/registry/registry";
import { StickerReprintForm } from "../../naklejki/sticker-forms";
import { editTool } from "../actions";
import { ToolForm } from "../tool-form";
import { loadToolCard } from "./load-tool-card";
import { ToolCorrections } from "./tool-corrections";
import { ToolDeadlines } from "./tool-deadlines";
import { ToolRateForm } from "./tool-rate-form";

export async function generateMetadata(props: PageProps<"/narzedzia/[id]">): Promise<Metadata> {
  const { card } = await loadToolCard((await props.params).id);
  return { title: card ? `${card.code} ${card.name}` : undefined };
}

/** „20,00 zł za dzień (1% wartości, stawka firmy)”: obowiązująca stawka dzienna i jej źródło. */
function dailyRateText(rate: EffectiveRate | null) {
  if (!rate) return t("dailyRates.toolRateNone");
  if (rate.source === "narzedzie") return `${t("dailyRates.toolRateAmount", { amount: formatMoney(rate.amount) })} (${t("dailyRates.source.narzedzie")})`;
  const percent = String(rate.percent).replace(".", ",");
  if (rate.amount === null) return t("dailyRates.toolRateNoValue", { percent });
  return `${t("dailyRates.toolRateAmount", { amount: formatMoney(rate.amount) })} (${t(`dailyRates.source.${rate.source}`, { percent })})`;
}

export default async function ToolCardPage(props: PageProps<"/narzedzia/[id]">) {
  const { session, card } = await loadToolCard((await props.params).id);
  if (!card) notFound();
  const registry = getRegistry().as(session.userId);
  const categories = canManageTools(session) ? await registry.categories() : [];
  const places = canCorrectTools(session) ? await registry.locations() : null;

  const none = t("toolCard.none");
  const details: [label: string, value: string][] = [
    [t("tools.category"), card.category.name],
    [t("tools.brand"), card.brand ?? none],
    [t("tools.model"), card.model ?? none],
    [t("tools.serialNumber"), card.serialNumber ?? none],
    ...("value" in card ? [[t("tools.value"), card.value == null ? none : formatMoney(card.value)] as [string, string]] : []),
    ...("dailyRate" in card ? [[t("dailyRates.toolRate"), dailyRateText(card.dailyRate ?? null)] as [string, string]] : []),
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
          <strong>
            {card.state === "w_obiegu"
              ? t("toolCard.inPlace", { place: card.location.name, days: formatDays(card.daysInPlace) })
              : t("toolCard.outOfCirculation", { state: t(`toolState.${card.state}`), place: card.location.name })}
          </strong>
        </p>
        {card.responsible && (
          <p data-testid="tool-responsible" className={card.responsible.active ? undefined : "text-danger"}>
            {t("toolCard.responsible", {
              name: card.responsible.active ? card.responsible.fullName : t("board.managerInactive", { name: card.responsible.fullName }),
            })}
          </p>
        )}
        {card.nextDeadline && (
          <p data-testid="tool-next-deadline">
            <a href="#terminy" className={card.nextDeadline.overdue ? "text-danger" : undefined}>
              {t("deadlines.nearest", { text: nextDeadlineText(card.nextDeadline) })}
            </a>
          </p>
        )}
      </section>

      {card.damagedSince && (
        <p className="damaged-note" role="status" data-testid="tool-damaged">
          <DamagedIcon /> {t("toolCard.damaged", { ago: damagedAgo(card.damagedSince, new Date()) })}
        </p>
      )}

      {card.state === "w_obiegu" && (
        <p className="tool-card-issues">
          <Link className="button button-danger tool-card-report-damage" href={`/zgloszenia/nowe?narzedzie=${card.id}&rodzaj=uszkodzenie`}>
            <DamagedIcon /> {t("toolCard.reportDamage")}
          </Link>
          <Link className="button button-quiet" href={`/zgloszenia/nowe?narzedzie=${card.id}&rodzaj=brak`}>
            {t("toolCard.reportOther")}
          </Link>
        </p>
      )}

      {card.lost && (
        <section className="lost" aria-labelledby="lost">
          <h2 id="lost" className="display section-title">
            {t("toolCard.lostTitle")}
          </h2>
          <p>{t("toolCard.lostSince", { when: formatDateTime(card.lost.since) })}</p>
          <p>{t("toolCard.lostLastLocation", { place: card.lost.lastLocation.name })}</p>
          <p>{card.lost.responsible ? t("toolCard.lostResponsible", { name: card.lost.responsible }) : t("toolCard.lostNoResponsible")}</p>
          {card.lost.reason && <p className="muted">{t("toolCard.reason", { reason: card.lost.reason })}</p>}
        </section>
      )}

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

      <ToolDeadlines session={session} card={card} />

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

      {canSeeCosts(session) && (
        <details className="panel">
          <summary className="panel-summary">{t("dailyRates.toolOwnTitle")}</summary>
          <ToolRateForm toolId={card.id} amount={card.dailyRate?.source === "narzedzie" ? card.dailyRate.amount : null} />
        </details>
      )}

      {canPrintStickers(session) && card.state === "w_obiegu" && card.registration === "zaakceptowane" && (
        <details className="panel">
          <summary className="panel-summary">{t("stickers.reprintTitle")}</summary>
          <StickerReprintForm toolId={card.id} />
        </details>
      )}

      <section aria-labelledby="history">
        <div className="section-head">
          <h2 id="history" className="display section-title">
            {t("toolCard.history")}
          </h2>
          <Link href={`/historia${historySearch({ toolId: card.id })}`}>{t("history.toolHistory")}</Link>
        </div>
        <ol className="history">
          {card.history.map((entry, index) => (
            <li key={index} className={entry.undone ? "history-undone" : undefined}>
              <time dateTime={entry.occurredAt.toISOString()}>{formatDateTime(entry.occurredAt)}</time>
              <strong>{t(`movementKind.${entry.kind}`)}</strong>
              {entry.undone && <span className="tag">{t("toolCard.undone")}</span>}
              <span>{movementRoute(entry.from, entry.to)}</span>
              {stateChangeText(entry.stateChange) && <span>{stateChangeText(entry.stateChange)}</span>}
              <span className="muted">
                {t("toolCard.movementBy", { author: entry.author, source: t(`movementSource.${entry.source}`) })}
              </span>
              {entry.reason && <span className="history-reason">{t("toolCard.reason", { reason: entry.reason })}</span>}
              {entry.transcript && <span className="history-reason">{t("toolCard.transcript", { text: entry.transcript })}</span>}
            </li>
          ))}
        </ol>
      </section>

      {places && (
        <details className="panel">
          <summary className="panel-summary">{t("toolCard.ownerActions")}</summary>
          <p className="muted">{t("toolCard.ownerActionsHint")}</p>
          <ToolCorrections
            tool={{ id: card.id, code: card.code, state: card.state, locationId: card.location.id }}
            places={{
              base: places.base,
              sites: places.sites.filter((site) => site.status === "aktywna" || site.id === card.location.id),
              vehicles: places.vehicles.filter((vehicle) => vehicle.active || vehicle.id === card.location.id),
              services: places.services,
            }}
            operationIds={{ correct: randomUUID(), lost: randomUUID(), retire: randomUUID() }}
          />
        </details>
      )}
    </>
  );
}
