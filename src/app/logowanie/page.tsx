import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { currentUserId } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("login.title") };

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");
  return (
    <AuthShell title={t("login.title")}>
      <LoginForm />
    </AuthShell>
  );
}
