import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { canManageTools, canSeeValues, MAX_PHOTO_BYTES } from "@/registry/registry";
import { editTool } from "../../actions";
import { ToolForm } from "../../tool-form";
import { loadToolCard } from "../load-tool-card";

export async function generateMetadata(props: PageProps<"/narzedzia/[id]/edycja">): Promise<Metadata> {
  const { card } = await loadToolCard((await props.params).id);
  return { title: card ? t("tools.editTitle", { code: card.code }) : undefined };
}

export default async function EditToolPage(props: PageProps<"/narzedzia/[id]/edycja">) {
  const { id } = await props.params;
  const { session, card } = await loadToolCard(id);
  if (!canManageTools(session)) redirect(`/narzedzia/${id}`);
  if (!card) notFound();
  const categories = await getRegistry().as(session.userId).categories();

  return (
    <>
      <h1 className="display page-title">{t("tools.editTitle", { code: card.code })}</h1>
      <ToolForm
        action={editTool.bind(null, card.id)}
        categories={categories}
        showOwnerFields={canSeeValues(session)}
        maxPhotoBytes={MAX_PHOTO_BYTES}
        initial={{
          code: card.code,
          name: card.name,
          categoryId: card.category.id,
          brand: card.brand ?? "",
          model: card.model ?? "",
          serialNumber: card.serialNumber ?? "",
          value: card.value == null ? "" : String(card.value).replace(".", ","),
          purchaseDate: card.purchaseDate ?? "",
          alarmThresholdDays: card.alarmThresholdDays == null ? "" : String(card.alarmThresholdDays),
          hasPhoto: card.photoUrl !== null,
        }}
        submitLabel={t("tools.submitEdit")}
        cancelHref={`/narzedzia/${card.id}`}
      />
    </>
  );
}
