"use client";

import { useState } from "react";
import { t } from "@/i18n/t";
import type { Category } from "@/registry/registry";
import { NewToolForm } from "./narzedzia/new-tool-form";
import { ReportToolForm, type ReportToolFormProps } from "./narzedzia/report-tool-form";
import { Checklist, type ChecklistData } from "./ruch/checklist";

type Operation = "wydanie" | "zwrot" | "narzedzie" | "zgloszenie";

export interface OperationsPanelProps {
  checklist: ChecklistData;
  /** Dodawanie narzędzi: tylko dla tych, którzy mogą zarządzać narzędziami. */
  newTool: { categories: Category[]; showValue: boolean; operationId: string } | false | null;
  /** Zgłaszanie narzędzi kupionych na budowę: tylko dla kierownika. */
  reportTool: ReportToolFormProps | false | null;
}

/** Wszystkie operacje tablicy w jednym miejscu: przycisk otwiera formularz tuż pod sobą, drugi klik go zwija. */
export function OperationsPanel({ checklist, newTool, reportTool }: OperationsPanelProps) {
  const [open, setOpen] = useState<Operation | null>(null);
  const operations: [Operation, string][] = [
    ["wydanie", t("board.issue")],
    ["zwrot", t("board.return")],
    ...(newTool ? [["narzedzie", t("board.addTool")] as [Operation, string]] : []),
    ...(reportTool ? [["zgloszenie", t("board.reportTool")] as [Operation, string]] : []),
  ];

  return (
    <section className="operations" aria-labelledby="operations-title">
      <h2 id="operations-title" className="display section-title">
        {t("board.operations")}
      </h2>
      <div className="operation-tabs">
        {operations.map(([operation, label]) => (
          <button
            key={operation}
            type="button"
            className={open === operation ? "button" : "button button-quiet"}
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
          {(open === "wydanie" || open === "zwrot") && <Checklist key={open} kind={open} {...checklist} />}
        </div>
      )}
    </section>
  );
}
