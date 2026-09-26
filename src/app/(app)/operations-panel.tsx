"use client";

import { useState } from "react";
import { type MessageKey, t } from "@/i18n/t";
import type { Category, RegisteredKind } from "@/registry/registry";
import { NewToolForm } from "./narzedzia/new-tool-form";
import { ReportToolForm, type ReportToolFormProps } from "./narzedzia/report-tool-form";
import { Checklist, type ChecklistData } from "./ruch/checklist";
import { Scanner } from "./ruch/scanner";
import { TextEntry } from "./ruch/text-entry";

type Operation = RegisteredKind | "skaner" | "tekst" | "narzedzie" | "zgloszenie";

const MOVEMENT_BUTTONS: [RegisteredKind, MessageKey][] = [
  ["wydanie", "board.issue"],
  ["zwrot", "board.return"],
  ["przeniesienie", "board.transfer"],
  ["do_serwisu", "board.toService"],
  ["z_serwisu", "board.fromService"],
];

export interface OperationsPanelProps {
  checklist: ChecklistData;
  /** Dodawanie narzędzi: tylko dla tych, którzy mogą zarządzać narzędziami. */
  newTool: { categories: Category[]; showValue: boolean; operationId: string; canImport: boolean; canPrintStickers: boolean } | false | null;
  /** Zgłaszanie narzędzi kupionych na budowę: tylko dla kierownika. */
  reportTool: ReportToolFormProps | false | null;
  /** Wpis tekstem z AI: gdy skonfigurowano dostawcę interpretacji. */
  textEntry: boolean;
}

/** Wszystkie operacje tablicy w jednym miejscu: przycisk otwiera formularz tuż pod sobą, drugi klik go zwija. */
export function OperationsPanel({ checklist, newTool, reportTool, textEntry }: OperationsPanelProps) {
  const [open, setOpen] = useState<Operation | null>(null);
  const movements = MOVEMENT_BUTTONS.filter(([kind]) => checklist.routes[kind]).map(([kind, label]): [Operation, string] => [kind, t(label)]);
  const operations: [Operation, string][] = [
    // Skaner podpowiada te same ruchy, więc jest tam, gdzie choć jeden z nich.
    ...(movements.length > 0 ? [["skaner", t("board.scan")] as [Operation, string]] : []),
    // Wpis tekstem proponuje wydanie, zwrot albo przeniesienie.
    ...(textEntry && (checklist.routes.wydanie || checklist.routes.zwrot || checklist.routes.przeniesienie)
      ? [["tekst", t("board.textEntry")] as [Operation, string]]
      : []),
    ...movements,
    ...(newTool ? [["narzedzie", t("board.addTool")] as [Operation, string]] : []),
    ...(reportTool ? [["zgloszenie", t("board.reportTool")] as [Operation, string]] : []),
  ];

  return (
    <section className="operations" aria-labelledby="operations-title">
      <h2 id="operations-title" className="display section-title">
        {t("board.operations")}
      </h2>
      <div className="operation-tabs">
        {operations.map(([operation, label], index) => (
          <button
            key={operation}
            type="button"
            // Nieparzysta liczba przycisków: ostatni zajmuje cały wiersz.
            className={[
              open === operation ? "button" : "button button-quiet",
              index === operations.length - 1 && operations.length % 2 === 1 && "operation-tab-wide",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-expanded={open === operation}
            onClick={() => setOpen((current) => (current === operation ? null : operation))}
          >
            {label}
          </button>
        ))}
      </div>
      {open && (
        <div id="operation-body" className="operation-body">
          {open === "narzedzie" && newTool && <NewToolForm {...newTool} />}
          {open === "zgloszenie" && reportTool && <ReportToolForm {...reportTool} />}
          {open === "skaner" && <Scanner data={checklist} />}
          {open === "tekst" && <TextEntry data={checklist} />}
          {open !== "skaner" && open !== "tekst" && open !== "narzedzie" && open !== "zgloszenie" && checklist.routes[open] && (
            <Checklist
              key={open}
              kind={open}
              operationId={checklist.operationId}
              places={checklist.places}
              route={checklist.routes[open]}
            />
          )}
        </div>
      )}
    </section>
  );
}
