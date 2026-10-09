"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { forgetBoard, rememberBoard, servedFromCache } from "@/lib/offline/service-worker";
import { preloadQrDecoder } from "./ruch/camera-scanner";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Tablica w telefonie bez sieci: zapamiętuje każdy świeży stan tablicy w service workerze, a gdy sieci nie ma
 * albo tablica przyszła z kopii, mówi, z której godziny są dane. Po powrocie sieci kopię zastępują świeże dane.
 * Bez `keepCopy` (właściciel z wylogowaniem po bezczynności, ADR 0044) kopia znika z telefonu.
 */
export function BoardSnapshot({ fetchedAt, keepCopy }: { fetchedAt: string; keepCopy: boolean }) {
  const router = useRouter();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  // Czas pobrania kopii, z której przyszła ta strona; znika z ekranu, gdy dojdą nowsze dane.
  const [copyFetchedAt, setCopyFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void servedFromCache().then((fromCache) => active && fromCache && setCopyFetchedAt(fetchedAt));
    return () => {
      active = false;
    };
    // Pytamy raz, o dokument, z którym strona się otworzyła.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromCopy = copyFetchedAt === fetchedAt;
  useEffect(() => {
    if (fromCopy && online) router.refresh();
  }, [fromCopy, online, router]);

  useEffect(() => {
    // Czytnik QR bez natywnego BarcodeDetectora (Safari) doładowuje bibliotekę; niech też będzie w telefonie.
    (keepCopy ? rememberBoard(fetchedAt) : forgetBoard())
      .then(preloadQrDecoder)
      .catch((error: unknown) => console.error(error));
  }, [fetchedAt, keepCopy]);

  if (online && !fromCopy) return null;
  return (
    <p className="board-snapshot" data-testid="board-snapshot" aria-live="polite">
      {t("board.snapshot", { when: formatDateTime(new Date(fetchedAt)) })}
    </p>
  );
}
