"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { submitKeepingValues } from "@/lib/forms";
import type { Category } from "@/registry/registry";
import { addCategory, type CategoryFormState, suggestCode, type ToolFormState } from "./actions";

export interface ToolFormValues {
  code: string;
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  value: string;
}

interface ToolFormProps {
  action: (prev: ToolFormState, formData: FormData) => Promise<ToolFormState>;
  categories: Category[];
  /** Wartość: pole tylko dla właściciela. */
  showValue: boolean;
  /** Karta do edycji; bez niej formularz dodaje nowe narzędzie z kodem nadanym przez system. */
  initial?: ToolFormValues;
  /** Tylko przy dodawaniu: identyfikator operacji, dzięki któremu ponowne wysłanie nie tworzy duplikatu. */
  operationId?: string;
  submitLabel: string;
}

export function ToolForm({
  action,
  categories: initialCategories,
  showValue,
  initial,
  operationId,
  submitLabel,
}: ToolFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [, startSuggesting] = useTransition();

  function chooseCategory(id: string) {
    setCategoryId(id);
    if (initial || !id) return;
    startSuggesting(async () => {
      setSuggestedCode(await suggestCode(id));
    });
  }

  return (
    <>
      <form onSubmit={submitKeepingValues(formAction)} className="stack-form">
        {operationId && <input type="hidden" name="operationId" value={operationId} />}
        {categories.length === 0 && <p className="empty">{t("tools.noCategories")}</p>}
        <div className="field">
          <label htmlFor="categoryId">{t("tools.category")}</label>
          <select id="categoryId" name="categoryId" value={categoryId} onChange={(event) => chooseCategory(event.target.value)} required>
            <option value="" disabled>
              {t("tools.categoryPlaceholder")}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {t("tools.categoryOption", { name: category.name, prefix: category.prefix })}
              </option>
            ))}
          </select>
        </div>
        {initial ? (
          <div className="field">
            <label htmlFor="code">{t("tools.code")}</label>
            <input
              id="code"
              name="code"
              className="plate-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              maxLength={20}
              required
            />
          </div>
        ) : (
          suggestedCode && (
            <p className="muted" role="status">
              {t("tools.codeAssigned")} <span className="plate">{suggestedCode}</span>
            </p>
          )
        )}
        <TextField name="name" label={t("tools.name")} defaultValue={initial?.name} required />
        <div className="field-row">
          <TextField name="brand" label={optional("tools.brand")} defaultValue={initial?.brand} />
          <TextField name="model" label={optional("tools.model")} defaultValue={initial?.model} />
        </div>
        <TextField name="serialNumber" label={optional("tools.serialNumber")} defaultValue={initial?.serialNumber} />
        {showValue && <TextField name="value" label={optional("tools.value")} defaultValue={initial?.value} inputMode="decimal" />}
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.saved && !pending && <p role="status">{t("tools.saved")}</p>}
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("tools.submitting") : submitLabel}
          </button>
        </div>
      </form>
      <CategoryForm
        onAdded={(category) => {
          setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name, "pl")));
          chooseCategory(category.id);
        }}
      />
    </>
  );
}

function optional(key: "tools.brand" | "tools.model" | "tools.serialNumber" | "tools.value") {
  return t("tools.optional", { field: t(key) });
}

function TextField({
  name,
  label,
  hint,
  ...input
}: { name: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} aria-describedby={hint ? `${name}-hint` : undefined} {...input} />
      {hint && <small id={`${name}-hint`}>{hint}</small>}
    </div>
  );
}

/** Osobny formularz (formularzy nie można zagnieżdżać), który po dodaniu wybiera nową kategorię. */
function CategoryForm({ onAdded }: { onAdded: (category: Category) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [prefix, setPrefix] = useState("");
  const prefixTouched = useRef(false);
  const [state, formAction, pending] = useActionState(async (prev: CategoryFormState, formData: FormData) => {
    const result = await addCategory(prev, formData);
    if (result.category) {
      onAdded(result.category);
      formRef.current?.reset();
      prefixTouched.current = false;
      setPrefix("");
    }
    return result;
  }, {});

  return (
    <details className="panel">
      <summary className="panel-summary">{t("categories.newTitle")}</summary>
      <form ref={formRef} onSubmit={submitKeepingValues(formAction)} className="stack-form">
        <div className="field">
          <label htmlFor="category-name">{t("categories.name")}</label>
          <input
            id="category-name"
            name="name"
            required
            onChange={(event) => {
              if (!prefixTouched.current) setPrefix(prefixFrom(event.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="category-prefix">{t("categories.prefix")}</label>
          <input
            id="category-prefix"
            name="prefix"
            className="plate-input"
            value={prefix}
            onChange={(event) => {
              prefixTouched.current = true;
              setPrefix(event.target.value.toUpperCase());
            }}
            maxLength={4}
            pattern="[A-Za-z]{1,4}"
            aria-describedby="category-prefix-hint"
            required
          />
          <small id="category-prefix-hint">{t("categories.prefixHint")}</small>
        </div>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.category && !pending && <p role="status">{t("categories.added", { name: state.category.name })}</p>}
        <button className="button button-quiet" type="submit" disabled={pending}>
          {pending ? t("categories.submitting") : t("categories.submit")}
        </button>
      </form>
    </details>
  );
}

/** Pierwsza litera nazwy bez polskich znaków: „Łaty” → L. */
function prefixFrom(name: string) {
  return name
    .trim()
    .replace(/ł/gi, "L")
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 1)
    .toUpperCase();
}
