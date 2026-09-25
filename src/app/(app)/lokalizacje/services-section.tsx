import { t } from "@/i18n/t";
import type { Service } from "@/registry/registry";
import { AddServiceForm } from "./location-forms";

/** Serwisy na tablicy właściciela. */
export function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section className="company-card" aria-labelledby="services">
      <div className="location-head">
        <h3 id="services" className="display section-title">
          {t("locations.services")}
        </h3>
        <span className="location-count">{services.length}</span>
      </div>
      <details className="panel">
        <summary className="panel-summary">{t("locations.addServiceTitle")}</summary>
        <AddServiceForm />
      </details>
      {services.length === 0 ? (
        <p className="empty">{t("locations.noServicesYet")}</p>
      ) : (
        <ul className="member-list">
          {services.map((service) => (
            <li key={service.id} className="member">
              <strong>{service.name}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
