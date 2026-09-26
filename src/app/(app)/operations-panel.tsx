"use client";

import { useState } from "react";
import { type MessageKey, t } from "@/i18n/t";
import type { Category, RegisteredKind } from "@/registry/registry";
import { NewToolForm } from "./narzedzia/new-tool-form";
import { ReportToolForm, type ReportToolFormProps } from "./narzedzia/report-tool-form";
import { Checklist, type ChecklistData } from "./ruch/checklist";

type Operation = RegisteredKind | "narzedzie" | "zgloszenie";

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
  newTool: { categories: Category[]; showValue: boolean; operationId: string; canImport: boolean } | false | null;
  /** Zgłaszanie narzędzi kupionych na budowę: tylko dla kierownika. */
  reportTool: ReportToolFormProps | false | null;
}

/** Wszystkie operacje tablicy w jednym miejscu: przycisk otwiera formularz tuż pod sobą, drugi klik go zwija. */
export function OperationsPanel({ checklist, newTool, reportTool }: OperationsPanelProps) {
  const [open, setOpen] = useState<Operation | null>(null);
  const operations: [Operation, string][] = [
    ...MOVEMENT_BUTTONS.filter(([kind]) => checklist.routes[kind]).map(([kind, label]): [Operation, string] => [kind, t(label)]),
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
          {open !== "narzedzie" && open !== "zgloszenie" && checklist.routes[open] && (
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
