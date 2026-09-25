import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { requireMember } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/registry/registry";
import { changePassword } from "./actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: t("changePassword.title") };

export default async function ChangePasswordPage() {
  if (!(await requireMember()).mustChangePassword) redirect("/");

  return (
    <AuthShell title={t("changePassword.title")}>
      <p>{t("changePassword.intro")}</p>
      <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} action={changePassword} />
    </AuthShell>
  );
}
