/** Ta sama naklejka liczy się ponownie dopiero wtedy, gdy przez tyle ms nie było jej w kadrze. */
export const REPEAT_AFTER_MS = 2000;

/**
 * Filtr odczytów z kolejnych klatek aparatu (webowego i natywnego): ten sam kod QR trzymany w kadrze liczy się raz. Zwraca
 * funkcję, która dla odczytu `text` w chwili `now` (ms) mówi, czy to nowy skan.
 */
export function repeatFilter() {
  let last = { text: "", seenAt: 0 };
  return (text: string, now: number) => {
    const fresh = text !== last.text || now - last.seenAt > REPEAT_AFTER_MS;
    last = { text, seenAt: now };
    return fresh;
  };
}
