import { useEffect, useEffectEvent } from "react";

const EVENT = "ngp:skanuj";

/** Ile skanerów tablicy czeka teraz na Skanuj (zwykle jeden, a zanim tablica się wczyta, żaden). */
let listeners = 0;

/**
 * Skanuj z nawigacji na samej tablicy otwiera skaner bez przejścia na `/?skanuj=1`: przejście pytałoby serwer, więc bez
 * zasięgu (tablica z kopii w telefonie) skaner by się nie otworzył, a odbicie offline zaczyna się właśnie tu. Zwraca
 * false, gdy skanera jeszcze nie ma (tablica się wczytuje): wtedy Skanuj ma przejść na `/?skanuj=1`, zamiast przepaść.
 */
export function requestScan(): boolean {
  if (listeners === 0) return false;
  window.dispatchEvent(new Event(EVENT));
  return true;
}

/**
 * Skaner na tablicy otwiera się na Skanuj z nawigacji (`requestScan`). Bez `enabled` (np. kto nie zapisuje ruchów)
 * skaner nie słucha, więc Skanuj przechodzi na `/?skanuj=1` zamiast nic nie zrobić.
 */
export function useScanRequest(onRequest: () => void, enabled = true) {
  const onEvent = useEffectEvent(onRequest);
  useEffect(() => {
    if (!enabled) return;
    const listener = () => onEvent();
    window.addEventListener(EVENT, listener);
    listeners += 1;
    return () => {
      window.removeEventListener(EVENT, listener);
      listeners -= 1;
    };
  }, [enabled]);
}
