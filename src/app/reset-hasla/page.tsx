import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: t("resetPassword.title") };

export default async function ResetPasswordPage(props: PageProps<"/reset-hasla">) {
  const { blad } = await props.searchParams;
  return (
    <AuthShell title={t("resetPassword.title")}>
      {blad ? (
        <p className="form-error" role="alert">
          {t("resetPassword.invalidLink")}
        </p>
      ) : (
        <p>{t("resetPassword.intro")}</p>
      )}
      <ResetPasswordForm />
      <p className="auth-links">
        <Link href="/logowanie">{t("resetPassword.backToLogin")}</Link>
      </p>
    </AuthShell>
  );
}
