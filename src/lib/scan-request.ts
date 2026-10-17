import { useEffect, useEffectEvent } from "react";

const EVENT = "ngp:skanuj";

/**
 * Skanuj z nawigacji na samej tablicy otwiera skaner bez przejścia na `/?skanuj=1`: przejście pytałoby serwer, więc bez
 * zasięgu (tablica z kopii w telefonie) skaner by się nie otworzył, a odbicie offline zaczyna się właśnie tu.
 */
export function requestScan() {
  window.dispatchEvent(new Event(EVENT));
}

/** Skaner na tablicy otwiera się na Skanuj z nawigacji (`requestScan`). */
export function useScanRequest(onRequest: () => void) {
  const onEvent = useEffectEvent(onRequest);
  useEffect(() => {
    const listener = () => onEvent();
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);
}
