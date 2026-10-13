import type { CSSProperties } from "react";
import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { perWorkerLoss, roiCases, ROI_ASSUMPTIONS, STOLEN_ON_SITES } from "@/lib/roi-text";

/** Liczby z badań w wierszu nad wykresami, każda ze źródłem. */
const STATS = ["thefts", "insiders", "search", "hour"] as const;

const share = (value: number) => ({ "--share": `${value}%` }) as CSSProperties;
const percent = (value: number) => `${Math.round(value)}%`;

/** Co ginie z polskich budów: słupki od zera, narzędzia wyróżnione, reszta szara jako tło. */
function StolenChart() {
  const max = Math.max(...STOLEN_ON_SITES.map((entry) => entry.share));
  return (
    <figure className="landing-chart">
      <figcaption>
        <h3>{t("landing.roi.stolen.title")}</h3>
        <p className="landing-chart-source">{t("landing.roi.stolen.source")}</p>
      </figcaption>
      <ul className="landing-hbars">
        {STOLEN_ON_SITES.map(({ item, share: value }) => (
          <li key={item} className={item === "tools" ? "landing-hbar-focus" : undefined}>
            <span className="landing-hbar-label">{t(`landing.roi.stolen.items.${item}`)}</span>
            <span className="landing-hbar-track" aria-hidden>
              <span className="landing-hbar" style={share((value / max) * 100)} />
            </span>
            <span className="landing-hbar-value">{`${value.toLocaleString("pl-PL")}%`}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Roczna strata na pracownika jako jeden pasek: czas szukania i narzędzia, z legendą zamiast podpisów w środku. */
function SplitChart() {
  const { toolLoss, timeCost, total } = perWorkerLoss();
  const parts = [
    { id: "time", amount: timeCost },
    { id: "tools", amount: toolLoss },
  ] as const;
  return (
    <figure className="landing-chart">
      <figcaption>
        <h3>{t("landing.roi.split.title", { total: formatPrice(total) })}</h3>
      </figcaption>
      <div className="landing-stack" aria-hidden>
        {parts.map(({ id, amount }) => (
          <span key={id} className={`landing-stack-${id}`} style={{ flexGrow: amount }} />
        ))}
      </div>
      <ul className="landing-legend">
        {parts.map(({ id, amount }) => (
          <li key={id}>
            <span className={`landing-swatch landing-stack-${id}`} aria-hidden />
            <span>{t(`landing.roi.split.${id}`)}</span>
            <strong>{formatPrice(amount)}</strong>
            <span className="landing-legend-share">{percent((amount / total) * 100)}</span>
          </li>
        ))}
      </ul>
      <p className="landing-chart-caption">{t("landing.roi.split.caption", { ratio: Math.round(timeCost / toolLoss) })}</p>
    </figure>
  );
}

/**
 * Dla każdej wielkości firmy duży procent i dwa paski w tej samej skali: roczne straty (czas i narzędzia, kolorami jak wyżej)
 * i pierwszy rok programu, żeby różnicę widać było bez czytania liczb.
 */
function PaybackChart() {
  const { toolLoss, total } = perWorkerLoss();
  const lossParts = [
    { id: "time", width: 100 - (toolLoss / total) * 100 },
    { id: "tools", width: (toolLoss / total) * 100 },
  ] as const;
  return (
    <figure className="landing-chart landing-chart-wide">
      <figcaption>
        <h3>{t("landing.roi.payback.title")}</h3>
      </figcaption>
      <ul className="landing-legend landing-legend-inline">
        <li>
          <span className="landing-swatch landing-stack-time" aria-hidden />
          <span>{t("landing.roi.split.time")}</span>
        </li>
        <li>
          <span className="landing-swatch landing-stack-tools" aria-hidden />
          <span>{t("landing.roi.split.tools")}</span>
        </li>
        <li>
          <span className="landing-swatch landing-payback-program" aria-hidden />
          <span>{t("landing.roi.payback.programLegend")}</span>
        </li>
      </ul>
      <ul className="landing-payback">
        {roiCases().map((firm) => (
          <li key={firm.size}>
            <h4>
              {t(`landing.roi.sizes.${firm.size}`)} <span>{t("landing.roi.payback.workers", { workers: firm.workers })}</span>
            </h4>
            <p className="landing-payback-share">
              <strong>{firm.firstYearPercent}</strong>
              <span>{t("landing.roi.payback.share")}</span>
            </p>
            <div className="landing-payback-bar">
              <p>
                <span>{t("landing.roi.payback.loss")}</span>
                <strong>{firm.totalLoss}</strong>
              </p>
              <span className="landing-stack" aria-hidden>
                {lossParts.map(({ id, width }) => (
                  <span key={id} className={`landing-stack-${id}`} style={{ flexGrow: width }} />
                ))}
              </span>
            </div>
            <div className="landing-payback-bar">
              <p>
                <span>{t("landing.roi.payback.program")}</span>
                <strong>{firm.firstYearCost}</strong>
              </p>
              <span className="landing-payback-track" aria-hidden>
                <span className="landing-payback-program" style={share(firm.firstYearShare)} />
              </span>
            </div>
            <p className="landing-payback-next">{t("landing.roi.payback.next", { amount: firm.nextYearCost, percent: firm.nextYearPercent })}</p>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Statystyki strat nad cennikiem: liczby z badań, dwa wykresy z nich i koszt programu na tle strat (wariant środkowy). */
export function LossStats() {
  return (
    <section className="landing-section" aria-labelledby="oplacalnosc">
      <h2 id="oplacalnosc" className="landing-section-title">
        {t("landing.roi.title")}
      </h2>
      <p className="landing-lead">{t("landing.roi.lead")}</p>
      <ul className="landing-stats">
        {STATS.map((stat) => (
          <li key={stat}>
            <strong>{t(`landing.roi.stats.${stat}.value`, { hourly: formatPrice(ROI_ASSUMPTIONS.hourlyCost) })}</strong>
            <span>{t(`landing.roi.stats.${stat}.text`)}</span>
            <small>{t(`landing.roi.stats.${stat}.source`)}</small>
          </li>
        ))}
      </ul>
      <div className="landing-charts">
        <StolenChart />
        <SplitChart />
        <PaybackChart />
      </div>
    </section>
  );
}
