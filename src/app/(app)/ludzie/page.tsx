import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTeam } from "@/registry/registry";
import { PeopleSection } from "./people-section";

export const metadata: Metadata = { title: t("people.title") };

/**
 * Kartoteka Ludzie: konta w programie i osoby bez konta, z zarządzaniem kontami. `?konto` rozwija założenie konta,
 * a `?konto=<osoba>` od razu dla tej osoby z kartoteki. Tylko właściciel.
 */
export default async function PeoplePage(props: PageProps<"/ludzie">) {
  const session = await requireSession();
  if (!canManageTeam(session)) redirect("/");
  const { konto } = await props.searchParams;
  const registry = getRegistry().as(session.userId);
  const [people, subscription] = await Promise.all([registry.people(), registry.subscription()]);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("people.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("people.title")}</h1>
      <p className="muted">{t("people.intro")}</p>
      <div className="company-grid">
        <PeopleSection session={session} people={people} recorders={subscription.recorders} accountFor={typeof konto === "string" ? konto : null} />
      </div>
    </>
  );
}
