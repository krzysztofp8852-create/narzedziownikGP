import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { formatDateTime } from "@/i18n/dates";
import { movementRoute, stateChangeText } from "@/i18n/movement-text";
import { t } from "@/i18n/t";
import type { Movement } from "@/registry/registry";

/** Ruch na liście: rodzaj, trasa, narzędzia (z odnośnikami do kart), powód, czas, osoba i źródło. */
export function MovementEntry({ movement, children }: { movement: Movement; children?: ReactNode }) {
  return (
    <li className={movement.undoneBy ? "movement movement-undone" : "movement"}>
      <div className="movement-head">
        <span className={`movement-kind movement-kind-${movement.kind}`}>{t(`movementKind.${movement.kind}`)}</span>
        {movement.undoneBy && <span className="tag">{t("toolCard.undone")}</span>}
        <span>{movementRoute(movement.from?.name ?? null, movement.to?.name ?? null)}</span>
        {stateChangeText(movement.stateChange) && <span>{stateChangeText(movement.stateChange)}</span>}
      </div>
      <p className="movement-tools">
        {movement.tools.map((tool, index) => (
          <Fragment key={tool.id}>
            {index > 0 && ", "}
            <Link href={`/narzedzia/${tool.id}`} title={tool.name}>
              {tool.code}
            </Link>
          </Fragment>
        ))}
      </p>
      {movement.reason && <p className="history-reason">{t("toolCard.reason", { reason: movement.reason })}</p>}
      <p className="muted movement-meta">
        <time dateTime={movement.occurredAt.toISOString()}>{formatDateTime(movement.occurredAt)}</time>
        {" · "}
        {t("board.movementBy", { author: movement.author, source: t(`movementSource.${movement.source}`) })}
      </p>
      {children}
    </li>
  );
}
