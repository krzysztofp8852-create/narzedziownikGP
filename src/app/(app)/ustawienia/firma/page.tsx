import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings } from "@/registry/registry";
import { SettingsSubpage, settingsPageTitle } from "../settings-subpage";
import { SubscriptionSection } from "../subscription-section";

export const generateMetadata = (): Metadata => ({ title: settingsPageTitle("firma") });

/** Firma i abonament: pakiet, wykorzystanie jego limitów i termin płatności. */
export default async function CompanySettingsPage() {
  const session = await requireSession();
  if (!canManageSettings(session)) redirect("/");
  const subscription = await getRegistry().as(session.userId).subscription();

  return (
    <SettingsSubpage page="firma">
      <SubscriptionSection subscription={subscription} demo={session.company.demo} />
    </SettingsSubpage>
  );
}
