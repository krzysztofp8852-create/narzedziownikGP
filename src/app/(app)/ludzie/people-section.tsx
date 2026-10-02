import Link from "next/link";
import { t } from "@/i18n/t";
import { isDemoEmail, MEMBER_ROLES, type Person, type PersonAccount, type RecorderSeats, type Session } from "@/registry/registry";
import { AddMemberForm } from "./add-member-form";
import { MemberActions } from "./member-actions";
import { AddPersonForm, DeactivatePersonButton, EditPersonForm } from "./person-forms";

/**
 * Kartoteka Ludzie: wszyscy w firmie, z kontem (rola, login, stan konta) i bez niego. Dopisanie osoby bez konta,
 * założenie konta (nowej osobie albo osobie z kartoteki) i działania na osobie rozwijane na żądanie. `accountFor`
 * rozwija założenie konta, a niepusty od razu wybiera w nim tę osobę.
 */
export function PeopleSection({
  session,
  people,
  recorders,
  accountFor,
}: {
  session: Session;
  people: Person[];
  recorders: RecorderSeats;
  accountFor: string | null;
}) {
  const accountless = people
    .filter((person) => person.active && person.account === null)
    .map((person) => ({ personId: person.personId, fullName: person.fullName }));
  return (
    <section id="ludzie" className="company-card company-team" aria-labelledby="people">
      <div className="location-head">
        <h2 id="people" className="display section-title">
          {t("people.listTitle")}
        </h2>
        <span className="location-count">{t("board.peopleCount", { count: people.filter((person) => person.active).length })}</span>
      </div>
      <details className="panel">
        <summary className="panel-summary">{t("people.addTitle")}</summary>
        <AddPersonForm />
      </details>
      <details id="konto" className="panel" open={accountFor !== null}>
        <summary className="panel-summary">{t("people.accountTitle")}</summary>
        <AddMemberForm key={accountFor} roles={MEMBER_ROLES} recorders={recorders} accountless={accountless} personId={accountFor || undefined} />
      </details>
      <ul className="member-list">
        {people.map((person) => (
          <li key={person.personId} className={person.active ? "member" : "member member-inactive"}>
            <div className="member-head">
              <strong>{person.fullName}</strong>
              <span className="muted">
                {person.account ? t("people.withAccount", { role: t(`roles.${person.account.role}`) }) : t("people.withoutAccount")}
                {person.account?.userId === session.userId && ` · ${t("team.you")}`}
              </span>
            </div>
            {person.note && <p className="muted member-email">{person.note}</p>}
            <Link className="member-link" href={`/ludzie/${person.personId}`}>
              {t("people.qualificationsLink")}
            </Link>
            {person.account && <Login account={person.account} />}
            <Status person={person} />
            {person.active && (
              <details className="member-more">
                <summary>{t("people.edit")}</summary>
                <EditPersonForm personId={person.personId} fullName={person.fullName} note={person.note} />
              </details>
            )}
            {person.active && person.account === null && (
              <div className="member-more">
                <Link className="member-link" href={`/ludzie?konto=${person.personId}#konto`}>
                  {t("people.giveAccount")}
                </Link>
                <DeactivatePersonButton personId={person.personId} fullName={person.fullName} />
              </div>
            )}
            {person.active && person.account?.active && person.account.role !== "wlasciciel" && (
              <details className="member-more">
                <summary>{t("team.manage")}</summary>
                <MemberActions memberId={person.account.userId} fullName={person.fullName} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Login({ account }: { account: PersonAccount }) {
  return (
    <>
      {account.username && <p className="muted member-email">{t("team.loginAs", { username: account.username })}</p>}
      {/* Konta demo mają techniczne adresy, na które nic nie wychodzi; oglądającym nic one nie mówią. */}
      {account.email && <p className="muted member-email">{isDemoEmail(account.email) ? t("team.demoEmail") : account.email}</p>}
    </>
  );
}

function Status({ person }: { person: Person }) {
  const { account } = person;
  const [status, label] = !person.active
    ? ["inactive", account ? t("team.statusInactive") : t("people.statusInactive")]
    : !account
      ? ["none", t("people.statusNoAccount")]
      : account.mustChangePassword
        ? ["pending", t("team.statusPending")]
        : ["active", t("team.statusActive")];
  return <p className={`member-status member-status-${status}`}>{label}</p>;
}
