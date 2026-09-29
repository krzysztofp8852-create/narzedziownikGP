import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { textEntryEnabled, voiceEntryEnabled } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import { TutorialCard } from "./tutorial";

export const metadata: Metadata = { title: t("tutorial.title") };

/** Samouczek otwarty ponownie znakiem „?” w nagłówku, także po pominięciu albo ukończeniu. */
export default async function TutorialPage() {
  const session = await requireSession();
  const tutorial = await getRegistry().as(session.userId).tutorial();
  if (!tutorial) redirect("/");
  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("tutorial.backToBoard")}
        </Link>
      </p>
      <TutorialCard tutorial={tutorial} entry={{ textEntry: textEntryEnabled(), voiceEntry: voiceEntryEnabled() }} />
    </>
  );
}
