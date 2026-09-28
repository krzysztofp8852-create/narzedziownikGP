import { t } from "@/i18n/t";
import { isDemoEmail, MEMBER_ROLES, type Session, type TeamMember } from "@/registry/registry";
import { AddMemberForm } from "./add-member-form";
import { MemberActions } from "./member-actions";

/** Zespół w ustawieniach właściciela: lista osób, a dodawanie i działania na koncie rozwijane na żądanie. */
export function TeamSection({ session, members }: { session: Session; members: TeamMember[] }) {
  return (
    <section id="zespol" className="company-card company-team" aria-labelledby="members">
      <div className="location-head">
        <h2 id="members" className="display section-title">
          {t("team.title")}
        </h2>
        <span className="location-count">{t("board.peopleCount", { count: members.filter((member) => member.active).length })}</span>
      </div>
      <details className="panel">
        <summary className="panel-summary">{t("team.addTitle")}</summary>
        <AddMemberForm roles={MEMBER_ROLES} />
      </details>
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId} className={member.active ? "member" : "member member-inactive"}>
            <div className="member-head">
              <strong>{member.fullName}</strong>
              <span className="muted">
                {t(`roles.${member.role}`)}
                {member.userId === session.userId && ` · ${t("team.you")}`}
              </span>
            </div>
            {member.username && <p className="muted member-email">{t("team.loginAs", { username: member.username })}</p>}
            {/* Konta demo mają techniczne adresy, na które nic nie wychodzi; oglądającym nic one nie mówią. */}
            {member.email && <p className="muted member-email">{isDemoEmail(member.email) ? t("team.demoEmail") : member.email}</p>}
            <Status member={member} />
            {member.active && member.role !== "wlasciciel" && (
              <details className="member-more">
                <summary>{t("team.manage")}</summary>
                <MemberActions memberId={member.userId} fullName={member.fullName} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Status({ member }: { member: TeamMember }) {
  const [status, label] = !member.active
    ? ["inactive", t("team.statusInactive")]
    : member.mustChangePassword
      ? ["pending", t("team.statusPending")]
      : ["active", t("team.statusActive")];
  return <p className={`member-status member-status-${status}`}>{label}</p>;
}
