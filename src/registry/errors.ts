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
  | "not_found"
  | "code_taken"
  | "category_taken"
  | "prefix_taken"
  | "invalid_manager"
  | "site_finished"
  | "site_not_empty"
  | "vehicle_inactive"
  | "vehicle_not_empty"
  | "movement_conflict"
  | "not_undoable"
  | "undo_expired"
  | "undo_blocked"
  | "reason_required"
  | "invalid_tool_state"
  | "import_invalid"
  | "not_reported"
  | "no_stickers"
  | "description_required"
  | "comment_required"
  | "tool_required"
  | "photo_invalid"
  | "issue_closed"
  | "message_required"
  | "read_only"
  | "demo_locked"
  | "demo_chat"
  | "demo_push";

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
