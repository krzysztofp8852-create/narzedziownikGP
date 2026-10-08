"use client";

import { usePathname } from "next/navigation";
import { SalesContact } from "@/components/sales-contact";
import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { tierPeople } from "@/lib/pricing-text";
import { supportChatOpenLink } from "@/lib/support-chat-text";
import type { RecorderSeats } from "@/registry/registry";

/**
 * Miejsca na osoby zapisujące ruchy przy dodawaniu osoby: z wolnym miejscem wykorzystanie, a bez niego potrzebny pakiet,
 * dopłata i kontakt do GP Engineering (przy każdej roli, bo pracownika i tak da się dodać). W pakiecie bez limitu nic.
 */
export function RecorderSeatsNote({ recorders }: { recorders: RecorderSeats }) {
  const pathname = usePathname();
  const { tier, recorderCount, seatsLeft, upgrade } = recorders;
  const limit = tier.maxPeople;
  if (limit === null || seatsLeft === null) return null;
  if (seatsLeft > 0 || !upgrade) {
    return (
      <p className="muted" data-testid="recorder-seats">
        {t("team.recorderSeats", { count: recorderCount, limit, left: seatsLeft })} {t("team.recorderSeatsHint")}
      </p>
    );
  }
  return (
    <div className="form-warning" role="status" data-testid="recorder-limit">
      <p>
        {t("team.recorderLimitReached", {
          tier: tier.name,
          count: recorderCount,
          limit,
          upgrade: upgrade.tier.name,
          people: tierPeople(upgrade.tier),
          surcharge: formatPrice(upgrade.surcharge),
        })}
      </p>
      <p>
        {t("team.recorderLimitContact")}{" "}
        <a href={supportChatOpenLink(pathname)}>{t("team.recorderLimitChat")}</a>{" "}
        {t("team.recorderLimitSales")}
      </p>
      <SalesContact />
    </div>
  );
}
