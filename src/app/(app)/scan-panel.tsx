"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";
import { useScanRequest } from "@/lib/scan-request";
import { recognizeCode, type ToolCode } from "@/lib/scanned-code";
import { OfflinePunch } from "./odbicie/offline-punch";
import { usePosterPunch } from "./odbicie/use-poster-punch";
import { ScanCodeInput, type ScanFeedback } from "./ruch/scan-code-input";

/**
 * Skanuj z nawigacji u tego, kto nie zapisuje ruchów (pracownik): plakat budowy prowadzi do odbicia, a naklejka
 * narzędzia firmy (albo kod wpisany ręcznie) do karty narzędzia, gdzie zgłosi usterkę. Naklejka spoza firmy daje
 * komunikat, a nie stronę „nie znaleziono”. Bez zasięgu odbicie idzie do kolejki offline, a karty bez sieci nie otworzy.
 * Otwiera go tylko Skanuj (`opened`), także na już otwartej tablicy.
 */
export function ScanPanel({
  userId,
  punchesOthers,
  tools,
  opened,
}: {
  userId: string;
  punchesOthers: boolean;
  /** Narzędzia z tablicy i zaginione: do kodu wpisanego ręcznie i do sprawdzenia naklejki. */
  tools: ToolCode[];
  opened: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(opened);
  const [linkedOpened, setLinkedOpened] = useState(opened);
  if (opened !== linkedOpened) {
    setLinkedOpened(opened);
    if (opened) setOpen(true);
  }
  // Na samej tablicy Skanuj otwiera panel bez przejścia (także bez zasięgu) i przewija do niego, gdy już jest na stronie
  // (zamknięty panel nie ma elementu, więc przewija efekt po otwarciu).
  const [requested, setRequested] = useState(0);
  useScanRequest(() => {
    setOpen(true);
    setRequested((count) => count + 1);
  });
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (requested > 0) sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [requested]);
  const { offlineCode, punchAt, closeOffline } = usePosterPunch();
  const [camera, setCamera] = useState(true);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);

  /** Plakat prowadzi do odbicia, narzędzie firmy do jego karty; true, gdy kod przyjęto. */
  function recognized(text: string, unrecognized: string): boolean {
    const code = recognizeCode(text, tools);
    if (code.kind === "nierozpoznany") {
      setFeedback({ text: unrecognized, error: true });
      return false;
    }
    if (code.kind === "narzedzie" && !tools.some((tool) => tool.id === code.toolId)) {
      setFeedback({ text: t("scanner.unknownSticker"), error: true });
      return false;
    }
    if (code.kind === "narzedzie" && !navigator.onLine) {
      setFeedback({ text: t("scan.toolOffline"), error: true });
      return false;
    }
    setFeedback(null);
    if (code.kind === "plakat") punchAt(code.code);
    else router.push(`/narzedzia/${code.toolId}`);
    return true;
  }

  function close() {
    closeOffline();
    setFeedback(null);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <section ref={sectionRef} className="scan-panel" aria-labelledby="scan-panel-title">
      <div className="section-head">
        <h2 id="scan-panel-title" className="display section-title">
          {t("nav.scan")}
        </h2>
        <button className="button button-quiet button-small" type="button" onClick={close}>
          {t("scan.close")}
        </button>
      </div>
      {offlineCode ? (
        <OfflinePunch key={offlineCode} userId={userId} code={offlineCode} punchesOthers={punchesOthers} onClose={close} />
      ) : (
        <ScanCodeInput
          onScan={(text) => void recognized(text, t("scanner.notRecognized"))}
          onTyped={(text) => recognized(text, t("scanner.unknownCode", { code: text.trim() }))}
          feedback={feedback}
          camera={camera}
          onCamera={setCamera}
          submitLabel={t("scan.go")}
          hint={t("scan.cameraHint")}
        />
      )}
    </section>
  );
}
