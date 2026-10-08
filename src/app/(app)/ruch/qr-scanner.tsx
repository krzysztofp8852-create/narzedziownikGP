"use client";

import { t } from "@/i18n/t";
import { useHasPlugin } from "@/lib/platform";
import { CameraScanner } from "./camera-scanner";
import { BARCODE_SCANNER, NativeScanner, type NativeScannerProps } from "./native-scanner";

/**
 * Jedno wejście do skanera kodów QR dla ruchu (naklejki) i odbicia (plakat budowy). W aplikacji z wtyczką ML Kit
 * skanuje natywnie, a w przeglądarce i w starszej wersji aplikacji bez wtyczki kamerą w stronie. Treść każdego
 * odczytanego kodu QR trafia do `onScan` tak samo, więc przepływ po skanie nie wie, który skaner ją odczytał.
 * `feedback` i `onClose` są dla nakładki skanera natywnego, która zasłania stronę na czas skanu.
 */
export function QrScanner({ onScan, hint = t("scanner.cameraHint"), feedback, onClose }: Omit<NativeScannerProps, "hint"> & { hint?: string }) {
  const native = useHasPlugin(BARCODE_SCANNER);
  return native ? (
    <NativeScanner onScan={onScan} hint={hint} feedback={feedback} onClose={onClose} />
  ) : (
    <CameraScanner onScan={onScan} hint={hint} />
  );
}
