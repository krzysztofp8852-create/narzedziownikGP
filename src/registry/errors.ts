/** Kody błędów Rejestru. Interfejs tłumaczy je przez `errors.<kod>` w plikach tłumaczeń. */
export type RegistryErrorCode =
  | "forbidden"
  | "no_access"
  | "password_change_required"
  | "password_too_short"
  | "stale_session"
  | "recovery_expired"
  | "invalid_input"
  | "email_taken"
  | "not_found"
  | "code_taken"
  | "category_taken"
  | "prefix_taken"
  | "invalid_manager"
  | "site_finished"
  | "movement_conflict"
  | "not_undoable"
  | "undo_expired"
  | "undo_blocked"
  | "reason_required"
  | "invalid_tool_state"
  | "not_reported";

export class RegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

export function isRegistryError(error: unknown): error is RegistryError {
  return error instanceof RegistryError;
}
