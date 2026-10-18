import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings } from "@/registry/registry";
import { CostSettingsSection, IdleLogoutSection, IssueSettingsSection } from "../settings-section";
import { SettingsSubpage, settingsPageTitle } from "../settings-subpage";

export const generateMetadata = (): Metadata => ({ title: settingsPageTitle("dostep") });

/** Ludzie i dostęp: kto widzi koszty, kto widzi zgłoszenia i po ilu minutach bezczynności wylogowuje się właściciel. */
export default async function AccessSettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");
  const settings = await getRegistry().as(session.userId).settings();

  return (
    <SettingsSubpage page="dostep">
      <CostSettingsSection settings={settings} />
      <IssueSettingsSection settings={settings} />
      {/* W demo konto właściciela dzielą wszyscy oglądający, więc wylogowanie po bezczynności tam nie działa. */}
      {!session.company.demo && <IdleLogoutSection settings={settings} />}
    </SettingsSubpage>
  );
}
