import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { t } from "@/i18n/t";
import { currentUserId } from "@/lib/auth";
import { safeNextPath } from "@/lib/next-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("login.title") };

export default async function LoginPage(props: PageProps<"/logowanie">) {
  const { next } = await props.searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  if (await currentUserId()) redirect(nextPath);
  return (
    <AuthShell title={t("login.title")}>
      <LoginForm nextPath={nextPath} />
    </AuthShell>
  );
}
