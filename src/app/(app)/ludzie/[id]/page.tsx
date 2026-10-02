import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { QualificationList } from "../qualifications";

export const metadata: Metadata = { title: t("qualifications.title") };

/**
 * Karta osoby z kartoteki: jej uprawnienia z datami, dokumentami i odnowieniami. Właściciel i kierownik widzą każdą
 * osobę, a magazynier i pracownik tylko siebie; inna osoba to „nie znaleziono”.
 */
export default async function PersonPage(props: PageProps<"/ludzie/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const [entry, customKinds] = await Promise.all([registry.personQualifications(id), registry.qualificationKinds()]);
  if (!entry) notFound();
  const { person } = entry;

  return (
    <>
      <p>
        <Link href="/ludzie" className="muted">
          {t("qualifications.back")}
        </Link>
      </p>
      <h1 className="display page-title">{person.fullName}</h1>
      <p className="muted">
        {person.role ? t("people.withAccount", { role: t(`roles.${person.role}`) }) : t("people.withoutAccount")}
        {!person.active && ` · ${t("people.statusInactive")}`}
      </p>
      <QualificationList session={session} entry={entry} customKinds={customKinds} />
    </>
  );
}
