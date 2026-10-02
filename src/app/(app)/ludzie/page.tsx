import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canAddQualificationKinds, canManageQualifications, canManageTeam } from "@/registry/registry";
import { PeopleSection } from "./people-section";
import { PeopleWithQualifications, QualificationKinds, QualificationList, UpcomingQualifications } from "./qualifications";

export const metadata: Metadata = { title: t("people.title") };

/**
 * Kartoteka Ludzie. Właściciel: konta w programie i osoby bez konta z zarządzaniem kontami, uprawnienia po terminie
 * i wkrótce oraz własne rodzaje uprawnień. `?konto` rozwija założenie konta, a `?konto=<osoba>` od razu dla tej osoby
 * z kartoteki. Kierownik: uprawnienia po terminie i wkrótce i osoby z uprawnieniami. Magazynier i pracownik: własne
 * uprawnienia.
 */
export default async function PeoplePage(props: PageProps<"/ludzie">) {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);

  if (!canManageQualifications(session)) {
    const [[own], customKinds] = await Promise.all([registry.peopleQualifications(), registry.qualificationKinds()]);
    return (
      <>
        <Back />
        <h1 className="display page-title">{t("qualifications.myTitle")}</h1>
        <p className="muted">{t("qualifications.myIntro")}</p>
        {own ? <QualificationList session={session} entry={own} customKinds={customKinds} /> : <p className="empty">{t("qualifications.myEmpty")}</p>}
      </>
    );
  }

  if (!canManageTeam(session)) {
    const [people, upcoming] = await Promise.all([registry.peopleQualifications(), registry.upcomingQualifications()]);
    return (
      <>
        <Back />
        <h1 className="display page-title">{t("people.title")}</h1>
        <p className="muted">{t("qualifications.managerIntro")}</p>
        <div className="company-grid">
          <UpcomingQualifications qualifications={upcoming} />
          <PeopleWithQualifications people={people} />
        </div>
      </>
    );
  }

  const { konto } = await props.searchParams;
  const [people, subscription, upcoming, customKinds] = await Promise.all([
    registry.people(),
    registry.subscription(),
    registry.upcomingQualifications(),
    registry.qualificationKinds(),
  ]);
  return (
    <>
      <Back />
      <h1 className="display page-title">{t("people.title")}</h1>
      <p className="muted">{t("people.intro")}</p>
      <div className="company-grid">
        <UpcomingQualifications qualifications={upcoming} />
        <PeopleSection session={session} people={people} recorders={subscription.recorders} accountFor={typeof konto === "string" ? konto : null} />
        <QualificationKinds kinds={customKinds} writable={!session.company.readOnly && canAddQualificationKinds(session)} />
      </div>
    </>
  );
}

function Back() {
  return (
    <p>
      <Link href="/" className="muted">
        {t("people.back")}
      </Link>
    </p>
  );
}
