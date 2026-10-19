"use client";

import { useRef, useState } from "react";
import { type MessageKey, t } from "@/i18n/t";
import { type BoardOperation, boardOperations } from "@/lib/board-view";
import { useScanRequest } from "@/lib/scan-request";
import type { Category, RegisteredKind } from "@/registry/registry";
import { NewToolForm } from "./narzedzia/new-tool-form";
import { RentedToolForm, type RentedToolFormProps } from "./narzedzia/rented-tool-form";
import { ReportToolForm, type ReportToolFormProps } from "./narzedzia/report-tool-form";
import { Checklist, type ChecklistData } from "./ruch/checklist";
import { Scanner } from "./ruch/scanner";
import { TextEntry } from "./ruch/text-entry";

type Operation = BoardOperation | "skaner";

const MOVEMENT_KINDS: RegisteredKind[] = ["wydanie", "zwrot", "przeniesienie", "do_serwisu", "z_serwisu"];

const LABELS: Record<Exclude<BoardOperation, "tekst">, MessageKey> = {
  wydanie: "board.issue",
  zwrot: "board.return",
  przeniesienie: "board.transfer",
  do_serwisu: "board.toService",
  z_serwisu: "board.fromService",
  narzedzie: "board.addTool",
  zgloszenie: "board.reportTool",
  wynajem: "board.addRentedTool",
};

/** Przyciski, które wskazuje przewodnik demo: wydanie na budowę i przyjęcie zwrotu. */
const TOUR_TARGETS: Partial<Record<BoardOperation, string>> = { wydanie: "issue", zwrot: "return" };

export interface OperationsPanelProps {
  checklist: ChecklistData;
  /** Dodawanie narzędzi: tylko dla tych, którzy mogą zarządzać narzędziami. */
  newTool: { categories: Category[]; showValue: boolean; operationId: string; canImport: boolean; canPrintStickers: boolean } | false | null;
  /** Zgłaszanie narzędzi kupionych na budowę: tylko dla kierownika. */
  reportTool: ReportToolFormProps | false | null;
  /** Przyjęcie sprzętu wynajętego: każdy, kto rejestruje ruchy. */
  rentedTool: RentedToolFormProps | false | null;
  /** Wpis tekstem z AI: gdy skonfigurowano dostawcę interpretacji. */
  textEntry: boolean;
  /** Nagrywanie głosu: gdy skonfigurowano także dostawcę transkrypcji. */
  voiceEntry: boolean;
  /** Propozycja z nagrania z kolejki offline do otwarcia (link „Do zatwierdzenia” w nagłówku). */
  recordingId?: string;
  /** Skanuj z nawigacji: skaner otwarty od razu (panel nie ma osobnego przycisku skanera). */
  scan?: boolean;
  /** Operacja otwarta z odnośnika (`?operacja=`), np. „Dodaj narzędzie” z pustego ekranu; niedostępna niczego nie otwiera. */
  requestedOperation?: BoardOperation | null;
  /** Plakat zeskanowany w skanerze: właściciel i kierownik odbijają też osoby z kartoteki. */
  punchesOthers: boolean;
}

/**
 * Operacje tablicy: Wydaj, Zwróć i Powiedz lub wpisz na wierzchu, rzadsze pod „Więcej operacji” (według uprawnień).
 * Przycisk otwiera formularz tuż pod przyciskami, drugi klik go zwija. Skaner otwiera Skanuj z nawigacji.
 */
export function OperationsPanel({
  checklist,
  newTool,
  reportTool,
  rentedTool,
  textEntry,
  voiceEntry,
  recordingId,
  scan = false,
  requestedOperation = null,
  punchesOthers,
}: OperationsPanelProps) {
  const movements = MOVEMENT_KINDS.filter((kind) => checklist.routes[kind]);
  const { top, more } = boardOperations([
    ...movements,
    // Głos i wpis tekstem proponują każdy z tych ruchów, a skaner podpowiada te same ruchy.
    ...(textEntry && movements.length > 0 ? ["tekst" as const] : []),
    ...(newTool ? ["narzedzie" as const] : []),
    ...(reportTool ? ["zgloszenie" as const] : []),
    ...(rentedTool ? ["wynajem" as const] : []),
  ]);
  const available = (requested: BoardOperation | null) => requested !== null && [...top, ...more].includes(requested);
  const [open, setOpen] = useState<Operation | null>(
    recordingId && textEntry ? "tekst" : scan && movements.length > 0 ? "skaner" : available(requestedOperation) ? requestedOperation : null,
  );
  const [moreShown, setMoreShown] = useState(false);
  // Link „Do zatwierdzenia” w nagłówku otwiera głos i wpis tekstem także na już otwartej tablicy.
  const [linkedRecording, setLinkedRecording] = useState(recordingId);
  if (recordingId !== linkedRecording) {
    setLinkedRecording(recordingId);
    if (recordingId && textEntry) setOpen("tekst");
  }
  // Tak samo Skanuj z nawigacji z innej strony otwiera skaner na już otwartej tablicy, a na samej tablicy bez przejścia.
  const [linkedScan, setLinkedScan] = useState(scan);
  if (scan !== linkedScan) {
    setLinkedScan(scan);
    if (scan && movements.length > 0) setOpen("skaner");
  }
  // I operacja z odnośnika na już otwartej tablicy (np. „Dodaj narzędzie” z pustego ekranu w formularzu obok).
  const [linkedOperation, setLinkedOperation] = useState(requestedOperation);
  if (requestedOperation !== linkedOperation) {
    setLinkedOperation(requestedOperation);
    if (available(requestedOperation)) setOpen(requestedOperation);
  }
  const sectionRef = useRef<HTMLElement>(null);
  useScanRequest(() => {
    setOpen("skaner");
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, movements.length > 0);
  // Pracownik nie rejestruje ruchów ani nie dodaje narzędzi: nie ma tu nic do zrobienia.
  if (top.length === 0) return null;

  const label = (operation: BoardOperation) => t(operation === "tekst" ? (voiceEntry ? "board.voiceEntry" : "board.textEntry") : LABELS[operation]);
  const button = (operation: BoardOperation) => (
    <button
      key={operation}
      type="button"
      className={open === operation ? "button" : "button button-quiet"}
      aria-expanded={open === operation}
      data-tour={TOUR_TARGETS[operation]}
      onClick={() => setOpen((current) => (current === operation ? null : operation))}
    >
      {label(operation)}
    </button>
  );
  // Otwarta rzadsza operacja trzyma „Więcej operacji” rozwinięte, żeby było widać, co jest otwarte; zwinięcie ją zamyka.
  const moreOpen = moreShown || more.some((operation) => operation === open);
  const toggleMore = () => {
    if (moreOpen && more.some((operation) => operation === open)) setOpen(null);
    setMoreShown(!moreOpen);
  };

  return (
    <section ref={sectionRef} className="operations" aria-labelledby="operations-title">
      <h2 id="operations-title" className="display section-title">
        {t("board.operations")}
      </h2>
      <div className="operation-tabs">
        {top.map(button)}
        {more.length > 0 && (
          <button
            type="button"
            className="button button-quiet operation-more"
            aria-expanded={moreOpen}
            aria-controls="operations-more"
            onClick={toggleMore}
          >
            {t("board.moreOperations")}
          </button>
        )}
      </div>
      {more.length > 0 && (
        <div id="operations-more" className="operation-tabs operation-tabs-more" hidden={!moreOpen}>
          {more.map(button)}
        </div>
      )}
      {open && (
        <div id="operation-body" className="operation-body">
          {open === "skaner" && (
            <div className="section-head">
              <h3 className="section-title">{t("board.scan")}</h3>
              <button type="button" className="button button-quiet button-small" onClick={() => setOpen(null)}>
                {t("board.closeScanner")}
              </button>
            </div>
          )}
          {open === "narzedzie" && newTool && <NewToolForm {...newTool} />}
          {open === "zgloszenie" && reportTool && <ReportToolForm {...reportTool} />}
          {open === "wynajem" && rentedTool && <RentedToolForm {...rentedTool} />}
          {open === "skaner" && <Scanner data={checklist} punchesOthers={punchesOthers} />}
          {open === "tekst" && <TextEntry data={checklist} voice={voiceEntry} recordingId={recordingId} />}
          {open !== "skaner" && open !== "tekst" && open !== "narzedzie" && open !== "zgloszenie" && open !== "wynajem" && checklist.routes[open] && (
            <Checklist
              key={open}
              kind={open}
              operationId={checklist.operationId}
              userId={checklist.userId}
              places={checklist.places}
              route={checklist.routes[open]}
            />
          )}
        </div>
      )}
    </section>
  );
}
