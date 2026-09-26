"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { type ColumnMapping, guessMapping, IMPORT_FIELDS, type ImportField, mapRows } from "@/import/columns";
import { readSheetFile, type Sheet, SheetError } from "@/import/sheet";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { newOperationId } from "@/lib/operation-id";
import { type ImportRowError, MAX_IMPORT_ROWS, type ToolImportPreview, type ToolImportRow } from "@/registry/registry";
import { commitImport, previewImport } from "./actions";

/** Z którego pola wiersza pochodzi tekst pokazywany przy błędzie. */
const ERROR_FIELD: Record<ImportRowError, ImportField | null> = {
  name_missing: null,
  category_missing: null,
  category_unknown: "category",
  code_invalid: "code",
  code_repeated: "code",
  code_taken: "code",
  value_invalid: "value",
  location_unknown: "location",
  location_ambiguous: "location",
  site_finished: "location",
};

/** Wgranie pliku, mapowanie kolumn, podgląd z błędami i zatwierdzenie importu. */
export function ToolImport(props: { operationId: string }) {
  const [operationId, setOperationId] = useState(props.operationId);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<ToolImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [reading, startReading] = useTransition();
  const [checking, startChecking] = useTransition();
  const [committing, startCommitting] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  // Odpowiedź na starszy podgląd (sprzed zmiany kolumn) nie może nadpisać nowszego.
  const previewRequest = useRef(0);

  const rows = sheet && mapping ? mapRows(sheet, mapping) : [];

  function check(nextSheet: Sheet, nextMapping: ColumnMapping) {
    const request = ++previewRequest.current;
    setPreview(null);
    startChecking(async () => {
      const result = await previewImport(mapRows(nextSheet, nextMapping));
      if (request !== previewRequest.current) return;
      if ("error" in result) setError(result.error);
      else setPreview(result.preview);
    });
  }

  function chooseFile(file: File | undefined) {
    previewRequest.current++;
    setSheet(null);
    setMapping(null);
    setPreview(null);
    setError(null);
    setImported(null);
    if (!file) return;
    startReading(async () => {
      try {
        const read = await readSheetFile({ name: file.name, data: await file.arrayBuffer() });
        if (read.rows.length > MAX_IMPORT_ROWS) {
          setError(t("import.fileErrors.tooMany", { count: read.rows.length, max: MAX_IMPORT_ROWS }));
          return;
        }
        const guessed = guessMapping(read.headers);
        setSheet(read);
        setMapping(guessed);
        check(read, guessed);
      } catch (readError) {
        setError(readError instanceof SheetError ? t(`import.fileErrors.${readError.code}`) : t("import.fileErrors.unreadable"));
      }
    });
  }

  function chooseColumn(field: ImportField, column: string) {
    if (!sheet || !mapping) return;
    const next = { ...mapping, [field]: column === "" ? null : Number(column) };
    setMapping(next);
    setError(null);
    check(sheet, next);
  }

  function commit() {
    if (!sheet || !mapping) return;
    startCommitting(async () => {
      const result = await commitImport(operationId, rows);
      if ("error" in result) {
        setError(result.error);
        if (result.invalid) check(sheet, mapping);
        return;
      }
      setImported(result.imported);
      setOperationId(newOperationId());
      setSheet(null);
      setMapping(null);
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  const shown = preview?.rows.map((row, index) => ({ row, index })).filter(({ row }) => !onlyErrors || row.errors.length > 0) ?? [];

  return (
    <div className="import-steps">
      <section className="company-card">
        <div className="field">
          <label htmlFor="import-file">{t("import.file")}</label>
          <input
            ref={fileInput}
            id="import-file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            disabled={committing}
          />
        </div>
        {reading && <p role="status">{t("import.reading")}</p>}
        {imported !== null && (
          <p role="status" className="checklist-done">
            {t("import.done", { count: imported })} <Link href="/">{t("import.openBoard")}</Link>
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {sheet && mapping && (
        <section className="company-card" aria-labelledby="import-mapping">
          <h2 id="import-mapping" className="display section-title">
            {t("import.mappingTitle")}
          </h2>
          <p className="muted">{t("import.mappingHint")}</p>
          <div className="filter-grid import-mapping">
            {IMPORT_FIELDS.map((field) => (
              <div key={field} className="field">
                <label htmlFor={`column-${field}`}>{fieldLabel(field)}</label>
                <select
                  id={`column-${field}`}
                  value={mapping[field] ?? ""}
                  onChange={(event) => chooseColumn(field, event.target.value)}
                  disabled={committing}
                >
                  <option value="">{t("import.noColumn")}</option>
                  {sheet.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {t("import.columnOption", { letter: columnLetter(index), header: header || "…" })}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {sheet && (
        <section className="company-card" aria-labelledby="import-preview" aria-busy={checking}>
          <div className="section-head">
            <h2 id="import-preview" className="display section-title">
              {t("import.previewTitle")}
            </h2>
            {preview && (
              <span>
                {t("import.summary", { count: preview.rows.length })}
                {preview.invalidRows > 0 && (
                  <>
                    {" · "}
                    <strong className="text-danger">{t("import.summaryErrors", { count: preview.invalidRows })}</strong>
                  </>
                )}
              </span>
            )}
          </div>
          {checking && <p role="status">{t("import.checking")}</p>}
          {preview && (
            <>
              <p role="status" className={preview.invalidRows > 0 ? "form-error" : undefined}>
                {preview.invalidRows > 0 ? t("import.fixFile") : t("import.allValid")}
              </p>
              {preview.invalidRows > 0 && (
                <label className="checkbox">
                  <input type="checkbox" checked={onlyErrors} onChange={(event) => setOnlyErrors(event.target.checked)} />
                  {t("import.onlyErrors")}
                </label>
              )}
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("import.line")}</th>
                      <th scope="col">{t("tools.code")}</th>
                      <th scope="col">{t("tools.name")}</th>
                      <th scope="col">{t("tools.category")}</th>
                      <th scope="col">{t("import.location")}</th>
                      <th scope="col" className="import-number">
                        {t("tools.value")}
                      </th>
                      <th scope="col">{t("import.problems")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(({ row, index }) => (
                      <tr key={index} className={row.errors.length > 0 ? "import-row-invalid" : undefined}>
                        <td>{sheet.rows[index].line}</td>
                        <td>
                          {row.code && <span className="plate">{row.code}</span>}
                          {row.codeAssigned && <span className="tag">{t("import.assigned")}</span>}
                        </td>
                        <td>{row.name}</td>
                        <td>{row.category?.name}</td>
                        <td>{row.location?.name}</td>
                        <td className="import-number">{row.value !== null && formatMoney(row.value)}</td>
                        <td>
                          {row.errors.length > 0 && (
                            <ul className="import-errors">
                              {row.errors.map((rowError) => (
                                <li key={rowError}>{errorText(rowError, rows[index], row.code)}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="button" type="button" onClick={commit} disabled={committing || checking || preview.invalidRows > 0}>
                  {committing ? t("import.submitting") : t("import.submit", { count: preview.rows.length })}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function fieldLabel(field: ImportField) {
  return field === "location" ? t("import.location") : t(`tools.${field}`);
}

function errorText(error: ImportRowError, raw: ToolImportRow | undefined, code: string | null) {
  const field = ERROR_FIELD[error];
  const value = field === "code" && error !== "code_invalid" ? code : field ? raw?.[field]?.trim() : null;
  return t(`import.rowErrors.${error}`, { value: value ?? "" });
}

/** Litera kolumny jak w Excelu: 0 → A, 26 → AA. */
function columnLetter(index: number): string {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}
