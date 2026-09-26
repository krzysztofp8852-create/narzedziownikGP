"use client";

import Link from "next/link";
import { useState } from "react";
import { t } from "@/i18n/t";
import { newOperationId } from "@/lib/operation-id";
import type { Category } from "@/registry/registry";
import { addTool, type ToolFormState } from "./actions";
import { ToolForm } from "./tool-form";

/** Dodawanie narzędzi z tablicy: po zapisie pusty formularz pod następne, z linkiem do karty dodanego. */
export function NewToolForm(props: { categories: Category[]; showValue: boolean; operationId: string }) {
  const [operationId, setOperationId] = useState(props.operationId);
  const [added, setAdded] = useState<ToolFormState["added"]>();

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
      {added && (
        <p role="status" className="checklist-done">
          {t("tools.added", { code: added.code, name: added.name })}{" "}
          <Link href={`/narzedzia/${added.id}`}>{t("tools.openCard")}</Link>
        </p>
      )}
      <ToolForm
        key={operationId}
        action={action}
        categories={props.categories}
        showValue={props.showValue}
        operationId={operationId}
        submitLabel={t("tools.submitAdd")}
      />
    </div>
  );
}
