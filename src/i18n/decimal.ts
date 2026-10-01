/** Liczba w zapisie polskim do pola formularza, bez grupowania: 1.5 to „1,5”, 3200.5 to „3200,5”. */
export function decimalText(value: number): string {
  return String(value).replace(".", ",");
}
