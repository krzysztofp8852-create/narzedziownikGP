"use client";

import Link from "next/link";
import { useState } from "react";
import { t } from "@/i18n/t";
import { newOperationId } from "@/lib/operation-id";
import type { Category } from "@/registry/registry";
import { addTool, type ToolFormState } from "./actions";
import { ToolForm } from "./tool-form";

/**
 * Dodawanie narzędzi z tablicy: po zapisie pusty formularz pod następne, z linkiem do karty dodanego.
 * `canImport`: odnośnik do importu listy z pliku, `canPrintStickers`: do naklejek QR (tylko właściciel).
 */
export function NewToolForm(props: {
  categories: Category[];
  showValue: boolean;
  operationId: string;
  canImport: boolean;
  canPrintStickers: boolean;
}) {
  const [operationId, setOperationId] = useState(props.operationId);
  const [added, setAdded] = useState<ToolFormState["added"]>();
  // Po zapisie formularz dostaje nowy `key`, a kategorie ze strony bywają sprzed dodanych w nim przed chwilą.
  const [addedCategories, setAddedCategories] = useState<Category[]>([]);
  const categories = [...props.categories, ...addedCategories.filter((category) => !props.categories.some(({ id }) => id === category.id))].sort(
    (a, b) => a.name.localeCompare(b.name, "pl"),
  );

  async function action(prev: ToolFormState, formData: FormData) {
    const result = await addTool(prev, formData);
    if (result.added) {
      setAdded(result.added);
      setOperationId(newOperationId());
    }
    return result;
  }

  return (
    <div className="stack-form">
      {props.canImport && (
        <p>
          <Link href="/narzedzia/import">{t("tools.importLink")}</Link>
        </p>
      )}
      {props.canPrintStickers && (
        <p>
          <Link href="/naklejki">{t("stickers.toolsLink")}</Link>
        </p>
      )}
      {added && (
        <p role="status" className="checklist-done">
          {t("tools.added", { code: added.code, name: added.name })}{" "}
          <Link href={`/narzedzia/${added.id}`}>{t("tools.openCard")}</Link>
        </p>
      )}
      {added?.limitWarning && (
        <p role="status" className="form-warning" data-testid="tool-limit-warning">
          {added.limitWarning}
        </p>
      )}
      <ToolForm
        key={operationId}
        action={action}
        categories={categories}
        onCategoryAdded={(category) => setAddedCategories((current) => [...current, category])}
        showValue={props.showValue}
        operationId={operationId}
        submitLabel={t("tools.submitAdd")}
      />
    </div>
  );
}
