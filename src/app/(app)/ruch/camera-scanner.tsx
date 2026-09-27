"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";

/** Natywny odczyt kodów (Chrome na Androidzie); Safari go nie ma. Typów nie ma jeszcze w lib.dom. */
interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): NativeBarcodeDetector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

/** Odczytuje kod QR z bieżącej klatki filmu; null, gdy w kadrze go nie ma. */
type ReadFrame = (video: HTMLVideoElement) => Promise<string | null>;

/** Co ile ms sprawdzamy klatkę. Częściej tylko grzeje telefon. */
const FRAME_INTERVAL_MS = 150;
/** Ta sama naklejka liczy się ponownie dopiero wtedy, gdy przez tyle ms nie było jej w kadrze. */
const REPEAT_AFTER_MS = 2000;
/** Dłuższy bok klatki dla biblioteki JS: mniejsza klatka to szybszy odczyt, a naklejka i tak wypełnia kadr. */
const JS_FRAME_SIZE = 640;

/**
 * Doładowuje bibliotekę jsQR tam, gdzie nie ma natywnego odczytu (Safari), żeby service worker miał ją
 * w telefonie i skaner działał także bez zasięgu.
 */
export async function preloadQrDecoder() {
  if (!window.BarcodeDetector) await import("jsqr");
}

/** Natywny BarcodeDetector, gdy umie QR; w przeciwnym razie biblioteka jsQR, ładowana dopiero wtedy. */
async function createFrameReader(): Promise<ReadFrame> {
  const Native = window.BarcodeDetector;
  if (Native && (await Native.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    const scale = Math.min(1, JS_FRAME_SIZE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

type CameraStatus = "starting" | "on" | "denied" | "insecure" | "unavailable";

/**
 * Podgląd tylnego aparatu, który odczytuje kolejne naklejki QR i przekazuje ich treść. Naklejka
 * trzymana w kadrze liczy się raz. Aparat gaśnie, gdy komponent znika.
 */
export function CameraScanner({ onScan }: { onScan: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;

    async function start() {
      // Przeglądarka daje aparat tylko stronie z HTTPS (albo z localhost).
      if (!window.isSecureContext) return setStatus("insecure");
      if (!navigator.mediaDevices?.getUserMedia) return setStatus("unavailable");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (error) {
        return setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
      }
      const video = videoRef.current;
      // Aparat wyłączono, zanim przeglądarka go dała: sprzątanie nie miało jeszcze czego zatrzymać.
      if (stopped || !video) return stream.getTracks().forEach((track) => track.stop());
      video.srcObject = stream;
      const readFrame = await Promise.all([video.play(), createFrameReader()]).then(([, reader]) => reader);
      if (stopped) return;
      setStatus("on");

      let last = { text: "", seenAt: 0 };
      const tick = async () => {
        if (stopped) return;
        const text = video.readyState >= video.HAVE_CURRENT_DATA ? await readFrame(video).catch(() => null) : null;
        if (text && !stopped) {
          const now = Date.now();
          if (text !== last.text || now - last.seenAt > REPEAT_AFTER_MS) onScanRef.current(text);
          last = { text, seenAt: now };
        }
        timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      };
      void tick();
    }

    start().catch(() => !stopped && setStatus("unavailable"));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (status === "denied" || status === "insecure" || status === "unavailable") {
    const message = { denied: "scanner.cameraDenied", insecure: "scanner.cameraInsecure", unavailable: "scanner.cameraUnavailable" } as const;
    return (
      <p className="form-error" role="alert">
        {t(message[status])}
      </p>
    );
  }
  return (
    <div className="camera">
      {/* Safari na iPhonie odtwarza podgląd w stronie tylko z playsInline i bez dźwięku. */}
      <video ref={videoRef} className="camera-video" playsInline muted aria-label={t("scanner.cameraPreview")} />
      <p className="muted">{t(status === "on" ? "scanner.cameraHint" : "scanner.cameraStarting")}</p>
    </div>
  );
}
