import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTeam, MEMBER_ROLES, type TeamMember } from "@/registry/registry";
import { AddMemberForm } from "./add-member-form";
import { MemberActions } from "./member-actions";

export const metadata: Metadata = { title: t("team.title") };

export default async function TeamPage() {
  const session = await requireSession();
  if (!canManageTeam(session)) redirect("/");
  const members = await getRegistry().as(session.userId).team();

  return (
    <>
      <h1 className="display page-title">{t("team.title")}</h1>

      <section className="panel" aria-labelledby="add-member">
        <h2 id="add-member" className="display section-title">
          {t("team.addTitle")}
        </h2>
        <AddMemberForm roles={MEMBER_ROLES} />
      </section>

      <section aria-labelledby="members">
        <h2 id="members" className="display section-title">
          {t("team.members")}
        </h2>
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
              <p className="muted member-email">{member.email}</p>
              <p className="member-status">{status(member)}</p>
              {member.active && member.role !== "wlasciciel" && (
                <MemberActions memberId={member.userId} fullName={member.fullName} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function status(member: TeamMember) {
  if (!member.active) return t("team.statusInactive");
  return member.mustChangePassword ? t("team.statusPending") : t("team.statusActive");
}
