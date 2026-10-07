"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/i18n/t";
import { nativePlugin } from "@/lib/platform";
import { repeatFilter } from "./scan-repeat";

/** Wtyczka skanera Google ML Kit w skorupie aplikacji (`@capacitor-mlkit/barcode-scanning` w `mobile/`). */
export const BARCODE_SCANNER = "BarcodeScanner";

type Handle = { remove(): Promise<void> };

/** To, czego skaner używa z wtyczki: skan z własną nakładką (`startScan`), zgoda na aparat i latarka. */
interface BarcodeScannerPlugin {
  checkPermissions(): Promise<{ camera: string }>;
  requestPermissions(): Promise<{ camera: string }>;
  openSettings(): Promise<void>;
  startScan(options: { formats: string[] }): Promise<void>;
  stopScan(): Promise<void>;
  isTorchAvailable(): Promise<{ available: boolean }>;
  enableTorch(): Promise<void>;
  disableTorch(): Promise<void>;
  /** Kody z kolejnych klatek, póki trwa skan. Mostek Androida oddaje uchwyt od razu, `@capacitor/core` w obietnicy. */
  addListener(event: "barcodesScanned", listener: (event: { barcodes: { rawValue?: string }[] }) => void): Handle | Promise<Handle>;
}

const scanner = () => nativePlugin<BarcodeScannerPlugin>(BARCODE_SCANNER);

/**
 * Wtyczka ma jeden aparat dla całej strony, więc start i stop kolejnych skanerów (zamknięty i od razu otwarty
 * ponownie) idą do niej po kolei. Inaczej spóźniony stop poprzedniego skanera gasiłby aparat następnego.
 */
let pluginQueue: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const result = pluginQueue.then(task);
  pluginQueue = result.catch(() => {});
  return result;
}

/** Klasa na <html> na czas skanu: obraz z aparatu jest pod WebView, więc strona robi się przezroczysta i znika. */
const ACTIVE_CLASS = "native-scanner-active";

type Status = "starting" | "on" | "denied" | "unavailable";

/** Co program zrobił z ostatnim skanem („Dodano S-01.”, „To nie jest naklejka narzędzia.”). */
export type ScanFeedback = { text: string; error: boolean } | null;

export interface NativeScannerProps {
  onScan: (text: string) => void;
  hint: string;
  /** Wynik ostatniego skanu na nakładce: strona pod nią jest na czas skanu niewidoczna. */
  feedback: ScanFeedback;
  /** „Zamknij skaner”: to samo co „Wyłącz aparat” pod nakładką. */
  onClose: () => void;
}

/**
 * Natywny skaner ML Kit w aplikacji na Androida: szybszy od webowego w słabym świetle i pod kątem, z latarką. Aparat
 * pokazuje się pod stroną, a nad nim nakładka z podpowiedzią, wynikiem ostatniego skanu i przyciskami. Kod trzymany
 * w kadrze liczy się raz, jak w skanerze webowym. O zgodę na aparat pyta przy pierwszym skanie; bez niej mówi, jak
 * ją włączyć, a po powrocie z ustawień telefonu ze zgodą rusza sam. Aparat gaśnie, gdy komponent znika (zamknięcie,
 * przejście na inną stronę).
 */
export function NativeScanner({ onScan, hint, feedback, onClose }: NativeScannerProps) {
  const [status, setStatus] = useState<Status>("starting");
  const [torch, setTorch] = useState({ available: false, on: false });
  // Kolejna próba uruchomienia skanu, np. po zgodzie na aparat włączonej w ustawieniach telefonu.
  const [attempt, setAttempt] = useState(0);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const plugin = scanner();
    let stopped = false;
    let listener: Handle | undefined;
    let started = false;
    const root = document.documentElement;

    async function start() {
      if (!plugin) return setStatus("unavailable");
      let { camera } = await plugin.checkPermissions();
      if (camera !== "granted" && !stopped) ({ camera } = await plugin.requestPermissions());
      if (stopped) return;
      if (camera !== "granted") return setStatus("denied");

      const fresh = repeatFilter();
      listener = await plugin.addListener("barcodesScanned", ({ barcodes }) => {
        const text = barcodes[0]?.rawValue;
        if (text && !stopped && fresh(text, Date.now())) onScanRef.current(text);
      });
      if (stopped) return void listener.remove();
      root.classList.add(ACTIVE_CLASS);
      started = true;
      await plugin.startScan({ formats: ["QR_CODE"] });
      if (stopped) return;
      setStatus("on");
      const { available } = await plugin.isTorchAvailable().catch(() => ({ available: false }));
      if (!stopped) setTorch({ available, on: false });
    }

    queued(start).catch(() => {
      root.classList.remove(ACTIVE_CLASS);
      if (!stopped) setStatus("unavailable");
    });
    return () => {
      stopped = true;
      root.classList.remove(ACTIVE_CLASS);
      void listener?.remove();
      // Po starcie z kolejki, więc także skan, który właśnie rusza. Zatrzymany skan gasi też latarkę.
      void queued(async () => started && plugin?.stopScan()).catch(() => {});
    };
  }, [attempt]);

  // Skorupa wysyła `resume`, gdy aplikacja wraca na wierzch, np. z ustawień telefonu otwartych przyciskiem poniżej.
  useEffect(() => {
    if (status !== "denied") return;
    const recheck = async () => {
      const permissions = await scanner()?.checkPermissions().catch(() => null);
      if (permissions?.camera !== "granted") return;
      setStatus("starting");
      setAttempt((count) => count + 1);
    };
    document.addEventListener("resume", recheck);
    return () => document.removeEventListener("resume", recheck);
  }, [status]);

  async function toggleTorch() {
    const on = !torch.on;
    try {
      await (on ? scanner()?.enableTorch() : scanner()?.disableTorch());
      setTorch((current) => ({ ...current, on }));
    } catch {
      // Latarka zajęta albo zepsuta: przycisk zostaje, jak był.
    }
  }

  if (status === "denied") {
    return (
      <div className="scanner-input">
        <p className="form-error" role="alert">
          {t("scanner.nativeDenied")}
        </p>
        <button className="button button-quiet" type="button" onClick={() => void scanner()?.openSettings()}>
          {t("scanner.openSettings")}
        </button>
      </div>
    );
  }
  if (status === "unavailable") {
    return (
      <p className="form-error" role="alert">
        {t("scanner.cameraUnavailable")}
      </p>
    );
  }
  return createPortal(
    <div className="native-scanner" role="dialog" aria-modal="true" aria-label={t("scanner.nativeTitle")}>
      <div className="native-scanner-bar native-scanner-top">
        <p>{status === "on" ? hint : t("scanner.cameraStarting")}</p>
      </div>
      <div className="native-scanner-frame" aria-hidden="true" />
      <div className="native-scanner-bar native-scanner-bottom">
        <p
          className={feedback?.error ? "native-scanner-feedback native-scanner-feedback-error" : "native-scanner-feedback"}
          data-testid="native-scanner-feedback"
          aria-live="polite"
        >
          {feedback?.text}
        </p>
        <div className="native-scanner-actions">
          {torch.available && (
            <button className="button button-quiet" type="button" aria-pressed={torch.on} onClick={() => void toggleTorch()}>
              {t("scanner.torch")}
            </button>
          )}
          <button className="button" type="button" onClick={onClose}>
            {t("scanner.nativeClose")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
