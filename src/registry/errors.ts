/** Kody błędów Rejestru. Interfejs tłumaczy je przez `errors.<kod>` w plikach tłumaczeń. */
export type RegistryErrorCode =
  | "forbidden"
  | "no_access"
  | "password_change_required"
  | "password_too_short"
  | "invalid_input"
  | "email_taken"
  | "not_found"
  | "code_taken"
  | "category_taken"
  | "prefix_taken"
  | "invalid_photo";

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
