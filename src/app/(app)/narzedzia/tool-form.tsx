"use client";

import Link from "next/link";
import { type ChangeEvent, useActionState, useRef, useState, useTransition } from "react";
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
  purchaseDate: string;
  alarmThresholdDays: string;
  hasPhoto: boolean;
}

interface ToolFormProps {
  action: (prev: ToolFormState, formData: FormData) => Promise<ToolFormState>;
  categories: Category[];
  /** Wartość i próg dni: pola tylko dla właściciela. */
  showOwnerFields: boolean;
  maxPhotoBytes: number;
  initial?: ToolFormValues;
  /** Tylko przy dodawaniu: identyfikator operacji, dzięki któremu ponowne wysłanie nie tworzy duplikatu. */
  operationId?: string;
  submitLabel: string;
  cancelHref: string;
}

const MAX_PHOTO_SIDE = 1600;

export function ToolForm({
  action,
  categories: initialCategories,
  showOwnerFields,
  maxPhotoBytes,
  initial,
  operationId,
  submitLabel,
  cancelHref,
}: ToolFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const codeTouched = useRef(Boolean(initial));
  const [, startSuggesting] = useTransition();

  function chooseCategory(id: string) {
    setCategoryId(id);
    if (codeTouched.current || !id) return;
    startSuggesting(async () => {
      const suggestion = await suggestCode(id);
      if (suggestion && !codeTouched.current) setCode(suggestion);
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
        <div className="field">
          <label htmlFor="code">{t("tools.code")}</label>
          <input
            id="code"
            name="code"
            className="plate-input"
            value={code}
            onChange={(event) => {
              codeTouched.current = true;
              setCode(event.target.value.toUpperCase());
            }}
            autoCapitalize="characters"
            maxLength={20}
            aria-describedby="code-hint"
            required={Boolean(initial)}
          />
          <small id="code-hint">{t("tools.codeHint")}</small>
        </div>
        <TextField name="name" label={t("tools.name")} defaultValue={initial?.name} required />
        <div className="field-row">
          <TextField name="brand" label={t("tools.brand")} defaultValue={initial?.brand} />
          <TextField name="model" label={t("tools.model")} defaultValue={initial?.model} />
        </div>
        <TextField name="serialNumber" label={t("tools.serialNumber")} defaultValue={initial?.serialNumber} />
        <div className="field-row">
          {showOwnerFields && <TextField name="value" label={t("tools.value")} defaultValue={initial?.value} inputMode="decimal" />}
          <TextField name="purchaseDate" label={t("tools.purchaseDate")} defaultValue={initial?.purchaseDate} type="date" />
        </div>
        {showOwnerFields && (
          <TextField
            name="alarmThresholdDays"
            label={t("tools.threshold")}
            defaultValue={initial?.alarmThresholdDays}
            type="number"
            min={1}
            step={1}
            hint={t("tools.thresholdHint")}
          />
        )}
        <PhotoField hasPhoto={initial?.hasPhoto ?? false} maxBytes={maxPhotoBytes} />
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>
            {pending ? t("tools.submitting") : submitLabel}
          </button>
          <Link className="button button-quiet" href={cancelHref}>
            {t("tools.cancel")}
          </Link>
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

function PhotoField({ hasPhoto, maxBytes }: { hasPhoto: boolean; maxBytes: number }) {
  // Zdjęcie z telefonu zmniejszamy w przeglądarce: szybciej wysyła się ze słabym zasięgiem.
  async function shrink(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.setCustomValidity("");
    if (!file) return;
    try {
      const smaller = await downscale(file);
      if (smaller) {
        const transfer = new DataTransfer();
        transfer.items.add(smaller);
        input.files = transfer.files;
      }
    } catch {
      // Przeglądarka nie umie odczytać pliku; wysyłamy oryginał, a serwer oceni, czy to dobre zdjęcie.
    }
    // Za duży plik odrzuciłaby platforma, zanim dotrze do serwera, więc mówimy o tym od razu.
    if ((input.files?.[0]?.size ?? 0) > maxBytes) {
      input.setCustomValidity(t("errors.invalid_photo"));
      input.reportValidity();
    }
  }

  return (
    <div className="field">
      <label htmlFor="photo">{t("tools.photo")}</label>
      <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={shrink} aria-describedby="photo-hint" />
      <small id="photo-hint">{t("tools.photoHint")}</small>
      {hasPhoto && (
        <label className="checkbox">
          <input type="checkbox" name="removePhoto" />
          {t("tools.removePhoto")}
        </label>
      )}
    </div>
  );
}

async function downscale(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg" && file.size < 1024 * 1024) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : null;
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
