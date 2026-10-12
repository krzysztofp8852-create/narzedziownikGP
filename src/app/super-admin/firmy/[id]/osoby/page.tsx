import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnonymizePersonButton } from "@/components/anonymize-person-button";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { anonymizePerson } from "../../../actions";

export const metadata: Metadata = { title: t("superAdmin.peopleTitle") };

/**
 * Osoby jednej firmy dla super-admina, z anonimizacją na prośbę osoby, która przyszła do GP Engineering. Konto
 * właściciela i osoby już zanonimizowane są bez przycisku.
 */
export default async function CompanyPeoplePage(props: PageProps<"/super-admin/firmy/[id]/osoby">) {
  const { id } = await props.params;
  // `pozostalo`: ile plików i kont logowania ostatnio zanonimizowanej osoby nie udało się usunąć.
  const leftovers = Number((await props.searchParams).pozostalo) || 0;
  const superAdmin = getRegistry().superAdmin(await requireSuperAdmin());
  const company = await superAdmin.company(id);
  if (!company) notFound();
  const people = await superAdmin.people(id);

  return (
    <>
      <p>
        <Link href={`/super-admin/firmy/${id}`} className="muted">
          {t("changeLog.backToCompany", { name: company.name })}
        </Link>
      </p>
      <h1 className="display page-title">{t("superAdmin.peopleTitle")}</h1>
      <p className="muted">{t("superAdmin.peopleIntro")}</p>
      {leftovers > 0 && (
        <p className="form-warning" role="status">
          {t("superAdmin.anonymizedWithLeftovers", { count: leftovers })}
        </p>
      )}
      {people.length === 0 ? (
        <p className="muted">{t("superAdmin.peopleEmpty")}</p>
      ) : (
        <ul className="member-list">
          {people.map((person) => (
            <li key={person.personId} className={person.active ? "member" : "member member-inactive"}>
              <div className="member-head">
                <strong>{person.fullName}</strong>
                <span className="muted">{person.role ? t(`roles.${person.role}`) : t("superAdmin.peopleNoAccount")}</span>
              </div>
              {person.login && <p className="muted member-email">{person.login}</p>}
              {person.anonymized ? (
                <p className="member-status member-status-inactive">{t("anonymize.status")}</p>
              ) : (
                <>
                  {!person.active && <p className="member-status member-status-inactive">{t("people.statusInactive")}</p>}
                  {person.role !== "wlasciciel" && (
                    <AnonymizePersonButton fullName={person.fullName} anonymize={anonymizePerson.bind(null, id, person.personId)} />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
