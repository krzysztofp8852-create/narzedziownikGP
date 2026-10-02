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
  | "username_taken"
  | "recorder_limit"
  | "not_found"
  | "code_taken"
  | "category_taken"
  | "prefix_taken"
  | "invalid_manager"
  | "site_finished"
  | "site_not_empty"
  | "vehicle_inactive"
  | "vin_invalid"
  | "vehicle_not_empty"
  | "movement_conflict"
  | "not_undoable"
  | "undo_expired"
  | "undo_blocked"
  | "reason_required"
  | "invalid_tool_state"
  | "import_invalid"
  | "not_reported"
  | "not_rented"
  | "no_stickers"
  | "description_required"
  | "comment_required"
  | "tool_required"
  | "photo_invalid"
  | "deadline_taken"
  | "qualification_taken"
  | "qualification_kind_taken"
  | "document_invalid"
  | "poster_invalid"
  | "poster_no_address"
  | "punch_overlap"
  | "issue_closed"
  | "message_required"
  | "read_only"
  | "demo_locked"
  | "demo_chat"
  | "demo_push"
  | "demo_delete"
  | "delete_requires_read_only"
  | "delete_confirmation";

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

/** Ta sama operacja klienta właśnie zapisała się w równoległej transakcji; ponowienie zwróci jej wynik. */
export class ReplayedOperationError extends Error {}

/** Czy błąd bazy to naruszenie tego ograniczenia unikalności (także przy wyścigu dwóch zapisów). */
export function isUniqueViolation(error: unknown, constraint: string) {
  const { code, constraint: violated } = error as { code?: string; constraint?: string };
  return code === "23505" && violated === constraint;
}
