import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { currentSignIn, requireMember } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/registry/registry";
import { ChangePasswordForm } from "../zmien-haslo/change-password-form";
import { setNewPassword } from "./actions";

export const metadata: Metadata = { title: t("newPassword.title") };

export default async function NewPasswordPage() {
  await requireMember();
  // Strona tylko dla sesji z linku resetu; Rejestr sprawdza też, czy link nie jest starszy niż godzina.
  if (!(await currentSignIn()).emailLinkAt) redirect("/");

  return (
    <AuthShell title={t("newPassword.title")}>
      <p>{t("newPassword.intro")}</p>
      <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} action={setNewPassword} />
    </AuthShell>
  );
}
