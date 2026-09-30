"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/t";
import { confirmsCompanyName, type ManagedCompany } from "@/registry/registry";
import { type DeleteCompanyState, deleteCompany } from "../../actions";

/**
 * Usunięcie firmy: dopiero w trybie tylko do odczytu i po wpisaniu jej nazwy. Przycisk czeka na zgodną nazwę,
 * a Rejestr sprawdza ją jeszcze raz.
 */
export function DeleteCompanyForm({ company }: { company: ManagedCompany }) {
  const [state, formAction, pending] = useActionState<DeleteCompanyState, FormData>(deleteCompany.bind(null, company.id), {});
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmsCompanyName(confirmation, company.name);

  return (
    <div className="stack-form">
      <p>{t("superAdmin.deleteIntro", { tools: company.toolCount })}</p>
      {company.status !== "tylko_do_odczytu" ? (
        <p className="form-warning" role="status">
          {t("superAdmin.deleteNeedsReadOnly")}
        </p>
      ) : (
        <form action={formAction} className="stack-form">
          <div className="field">
            <label htmlFor="delete-confirmation">{t("superAdmin.deleteConfirmLabel", { name: company.name })}</label>
            <input
              id="delete-confirmation"
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="form-actions">
            <button className="button button-danger" type="submit" disabled={pending || !confirmed}>
              {pending ? t("superAdmin.deleting") : t("superAdmin.deleteSubmit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
