import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTools, canSeeValues, MAX_PHOTO_BYTES } from "@/registry/registry";
import { addTool } from "../actions";
import { ToolForm } from "../tool-form";

export const metadata: Metadata = { title: t("tools.newTitle") };

export default async function NewToolPage() {
  const session = await requireSession();
  if (!canManageTools(session)) redirect("/");
  const categories = await getRegistry().as(session.userId).categories();

  return (
    <>
      <h1 className="display page-title">{t("tools.newTitle")}</h1>
      <ToolForm
        action={addTool}
        categories={categories}
        showOwnerFields={canSeeValues(session)}
        maxPhotoBytes={MAX_PHOTO_BYTES}
        operationId={randomUUID()}
        submitLabel={t("tools.submitAdd")}
        cancelHref="/"
      />
    </>
  );
}
