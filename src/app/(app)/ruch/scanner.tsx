"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { t } from "@/i18n/t";
import { queuedFromForm, sendOrQueue } from "@/lib/offline/client";
import { newOperationId } from "@/lib/operation-id";
import { recognizeCode } from "@/lib/scanned-code";
import type { RegisteredKind } from "@/registry/registry";
import { OfflinePunch } from "../odbicie/offline-punch";
import { usePosterPunch } from "../odbicie/use-poster-punch";
import { type ChecklistState, registerMovement } from "./actions";
import { type ChecklistData, type ChecklistPlace, type ChecklistTool, DamagedWarnings, DeadlineHints, PlaceName, serviceFollowUp } from "./checklist";
import { type DoneMovement, type FollowUpTool, MovementResult } from "./movement-result";
import { ScanCodeInput, type ScanFeedback } from "./scan-code-input";
import { planScan, type ScanGroup, type ScanOption } from "./scan-plan";

/** Co wybrano w grupie zamiast podpowiedzi: rodzaj ruchu i dokąd. */
type Choice = { kind?: RegisteredKind; to?: string };

/** Wysłany ruch: co zniknie z listy po zapisie. */
interface Submitted {
  /** Rodzaj, skąd, dokąd i narzędzia: ten sam ruch wysłany ponownie ma ten sam identyfikator operacji. */
  signature: string;
  fromId: string;
  toolIds: string[];
  summary: string;
  /** Narzędzia z serwisu z przeglądem do wpisania. */
  followUp: FollowUpTool[];
}

/**
 * Skanuj u tych, którzy zapisują ruchy: kolejne zeskanowane (albo wpisane) narzędzia trafiają na listę, podzieloną na
 * ruchy według miejsca, w którym są teraz. Każdy ruch ma podpowiedziany rodzaj i zatwierdza się go tak jak checklistę,
 * ze źródłem `qr`. Plakat budowy prowadzi do odbicia (właściciel i kierownik, `punchesOthers`, odbijają też osoby
 * z kartoteki).
 */
export function Scanner({ data, punchesOthers }: { data: ChecklistData; punchesOthers: boolean }) {
  const [scannedIds, setScannedIds] = useState<string[]>([]);
  const { offlineCode, punchAt, closeOffline } = usePosterPunch();
  const [camera, setCamera] = useState(true);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [done, setDone] = useState<DoneMovement | null>(null);
  // Ponowne wysłanie tego samego ruchu (np. po zerwanym połączeniu) idzie pod tym samym
  // identyfikatorem operacji, więc się nie zdubluje; każdy inny ruch dostaje nowy.
  const operationIds = useRef(new Map<string, string>());
  const submitted = useRef<Submitted | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ChecklistState, formData: FormData) => {
    const sent = submitted.current;
    const summary = sent?.summary ?? "";
    const result = await sendOrQueue(() => registerMovement(prev, formData), queuedFromForm(formData, { userId: data.userId, summary }));
    const done =
      result === "queued"
        ? { summary, notified: [], queued: true }
        : result.done && { summary, notified: result.done.notified, movementId: result.done.movementId, followUp: sent?.followUp };
    if (done && sent) {
      operationIds.current.delete(sent.signature);
      setScannedIds((ids) => ids.filter((id) => !sent.toolIds.includes(id)));
      // Kolejne narzędzia z tego miejsca znowu dostaną podpowiedź, a nie poprzedni wybór.
      setChoices((current) => Object.fromEntries(Object.entries(current).filter(([fromId]) => fromId !== sent.fromId)));
      setDone(done);
    }
    return result === "queued" ? {} : result;
  }, {});

  const toolsById = new Map(data.places.flatMap((place) => place.tools.map((tool) => [tool.id, tool] as const)));
  const groups = planScan(scannedIds, data);

  function add(tool: ChecklistTool) {
    setDone(null);
    if (scannedIds.includes(tool.id)) {
      setFeedback({ text: t("scanner.alreadyAdded", { code: tool.code }), error: false });
      return;
    }
    setScannedIds((ids) => (ids.includes(tool.id) ? ids : [...ids, tool.id]));
    setFeedback({ text: t("scanner.added", { code: tool.code }), error: false });
    navigator.vibrate?.(60);
  }

  /**
   * Narzędzie z tablicy trafia na listę, plakat prowadzi do odbicia; true, gdy kod przyjęto. Plakat nie wyrzuca
   * niezatwierdzonej listy: najpierw trzeba ją zatwierdzić albo wyczyścić.
   */
  function recognized(text: string, unrecognized: string): boolean {
    const code = recognizeCode(text, [...toolsById.values()]);
    if (code.kind === "plakat" && groups.length > 0) {
      setFeedback({ text: t("scanner.posterWithList"), error: true });
      return false;
    }
    if (code.kind === "plakat") {
      setFeedback(null);
      punchAt(code.code);
      return true;
    }
    const tool = code.kind === "narzedzie" && toolsById.get(code.toolId);
    if (tool) {
      add(tool);
      return true;
    }
    setFeedback({ text: code.kind === "narzedzie" ? t("scanner.unknownSticker") : unrecognized, error: true });
    return false;
  }

  function remove(toolId: string) {
    setScannedIds((ids) => ids.filter((id) => id !== toolId));
    setDone(null);
  }

  function choose(fromId: string, choice: Choice) {
    setChoices((current) => ({ ...current, [fromId]: { ...current[fromId], ...choice } }));
    setDone(null);
  }

  function clear() {
    setScannedIds([]);
    setChoices({});
    setDone(null);
  }

  /** Wysyła formularz ruchu bez `<form action>`, jak `submitKeepingValues`, z identyfikatorem operacji ruchu. */
  function submit(form: HTMLFormElement, sent: Submitted) {
    const formData = new FormData(form);
    let operationId = operationIds.current.get(sent.signature);
    if (!operationId) {
      operationId = newOperationId();
      operationIds.current.set(sent.signature, operationId);
    }
    formData.set("operationId", operationId);
    submitted.current = sent;
    startTransition(() => formAction(formData));
  }

  return (
    <div className="scanner">
      {offlineCode ? (
        <OfflinePunch key={offlineCode} userId={data.userId} code={offlineCode} punchesOthers={punchesOthers} onClose={closeOffline} />
      ) : (
        <ScanCodeInput
          onScan={(text) => void recognized(text, t("scanner.notRecognized"))}
          onTyped={(text) => recognized(text, t("scanner.unknownCode", { code: text.trim() }))}
          feedback={feedback}
          camera={camera}
          onCamera={setCamera}
          submitLabel={t("scanner.manualAdd")}
        />
      )}

      <MovementResult done={done} state={state} refreshedHint={t("scanner.conflictRefreshed")} />

      {groups.length === 0 ? (
        <EmptyState>{t("scanner.empty")}</EmptyState>
      ) : (
        <>
          {groups.map((group) => (
            <ScanGroupForm
              key={group.from.id}
              group={group}
              choice={choices[group.from.id] ?? {}}
              pending={pending}
              onChoose={(choice) => choose(group.from.id, choice)}
              onRemove={remove}
              onSubmit={submit}
            />
          ))}
          <button className="button button-quiet" type="button" onClick={clear} disabled={pending}>
            {t("scanner.clear")}
          </button>
        </>
      )}
    </div>
  );
}

interface ScanGroupFormProps {
  group: ScanGroup;
  choice: Choice;
  pending: boolean;
  onChoose: (choice: Choice) => void;
  onRemove: (toolId: string) => void;
  onSubmit: (form: HTMLFormElement, sent: Submitted) => void;
}

/** Jeden ruch ze skanera: narzędzia z jednego miejsca, rodzaj ruchu (podpowiedziany) i dokąd. */
function ScanGroupForm({ group, choice, pending, onChoose, onRemove, onSubmit }: ScanGroupFormProps) {
  const { from, tools, options } = group;
  const option: ScanOption | undefined = options.find((candidate) => candidate.kind === choice.kind) ?? options[0];
  // Jedyne miejsce docelowe wybieramy od razu; wybór spoza listy (np. po zmianie rodzaju) przepada.
  const to: ChecklistPlace | undefined =
    option && (option.to.length === 1 ? option.to[0] : option.to.find((place) => place.id === choice.to));
  const codes = tools.map((tool) => tool.code).join(", ");
  const summary = to ? t("checklist.summary", { codes, place: to.name }) : "";

  return (
    <form
      className="scan-group"
      aria-label={t("scanner.groupLabel", { place: from.name })}
      onSubmit={(event) => {
        event.preventDefault();
        if (!option || !to) return;
        onSubmit(event.currentTarget, {
          signature: [option.kind, from.id, to.id, ...tools.map((tool) => tool.id).sort()].join(" "),
          fromId: from.id,
          toolIds: tools.map((tool) => tool.id),
          summary,
          followUp: serviceFollowUp(tools, option.kind),
        });
      }}
    >
      <input type="hidden" name="source" value="qr" />
      <input type="hidden" name="kind" value={option?.kind ?? ""} />
      <input type="hidden" name="fromLocationId" value={from.id} />
      <input type="hidden" name="toLocationId" value={to?.id ?? ""} />
      {tools.map((tool) => (
        <input key={tool.id} type="hidden" name="toolId" value={tool.id} />
      ))}

      <h3 className="scan-group-from">{t("scanner.from", { place: from.name })}</h3>
      <ul className="scan-tools">
        {tools.map((tool) => (
          <li key={tool.id} className="scan-tool">
            <span className="plate">{tool.code}</span>
            <span className="tool-row-name">{tool.name}</span>
            <button
              className="button button-quiet scan-remove"
              type="button"
              onClick={() => onRemove(tool.id)}
              aria-label={t("scanner.remove", { code: tool.code })}
              title={t("scanner.remove", { code: tool.code })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {!option ? (
        <EmptyState>{t("scanner.cannotMove")}</EmptyState>
      ) : (
        <>
          {options.length > 1 && (
            <fieldset className="checklist-section">
              <legend className="scan-legend">{t("scanner.kind")}</legend>
              <div className="choice-list">
                {options.map((candidate, index) => (
                  <label key={candidate.kind} className="choice">
                    <input
                      type="radio"
                      name="kindChoice"
                      value={candidate.kind}
                      checked={candidate.kind === option.kind}
                      onChange={() => onChoose({ kind: candidate.kind })}
                    />
                    <span className="choice-name">{t(`movementKind.${candidate.kind}`)}</span>
                    {index === 0 && <span className="choice-tag">{t("scanner.suggested")}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {option.to.length > 1 && (
            <fieldset className="checklist-section">
              <legend className="scan-legend">{t(`checklist.kinds.${option.kind}.to`)}</legend>
              <div className="choice-list">
                {option.to.map((place) => (
                  <label key={place.id} className="choice">
                    <input
                      type="radio"
                      name="toChoice"
                      value={place.id}
                      checked={place.id === to?.id}
                      onChange={() => onChoose({ to: place.id })}
                    />
                    <PlaceName place={place} />
                    {place.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p className="checklist-summary-text" data-testid="scan-summary">
            {t(`movementKind.${option.kind}`)}: {to ? summary : t("scanner.chooseTo")}
          </p>
          <DamagedWarnings tools={tools} kind={option.kind} />
          <DeadlineHints tools={tools} kind={option.kind} />
          <div className="form-actions">
            <button className="button" type="submit" disabled={!to || pending}>
              {pending ? t("checklist.confirming") : t("checklist.confirm")}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
