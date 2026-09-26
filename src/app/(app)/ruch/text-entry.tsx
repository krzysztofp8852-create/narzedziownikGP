"use client";

import { type FormEvent, startTransition, useActionState, useRef, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import type { Proposal } from "@/interpretation/proposal";
import { newOperationId } from "@/lib/operation-id";
import { matchesTool } from "@/lib/tool-search";
import { type ChecklistState, confirmProposal, proposeMovement } from "./actions";
import type { ChecklistData } from "./checklist";
import { type DoneMovement, MovementResult } from "./movement-result";
import { type Draft, planDraft, startDraft } from "./proposal-draft";

/** Ile narzędzi do dodania pokazujemy naraz; resztę zawęża wyszukiwanie. */
const ADDABLE_LIMIT = 8;

/**
 * Wpis tekstem: kierownik pisze zdanie, a system odpowiada propozycją ruchu (rodzaj, budowa, narzędzia
 * z kodami), pyta o niejednoznaczne narzędzia i daje ją poprawić. Nic się nie zapisuje przed ✓.
 */
export function TextEntry({ data }: { data: ChecklistData }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ asked: string; proposal?: Proposal; error?: string; round: number } | null>(null);
  const [done, setDone] = useState<DoneMovement | null>(null);
  const [asking, startAsking] = useTransition();

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = text.trim();
    if (!asked) return;
    setDone(null);
    startAsking(async () => {
      const result = await proposeMovement(asked);
      setReply((previous) => ({ asked, ...result, round: (previous?.round ?? 0) + 1 }));
    });
  }

  return (
    <div className="text-entry">
      <form className="text-entry-ask" onSubmit={ask}>
        <div className="field">
          <label htmlFor="text-entry-text">{t("textEntry.label")}</label>
          <textarea
            id="text-entry-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={t("textEntry.placeholder")}
            rows={2}
            maxLength={2000}
            enterKeyHint="send"
            aria-describedby="text-entry-hint"
          />
          <small id="text-entry-hint">{t("textEntry.hint")}</small>
        </div>
        <button className="button" type="submit" disabled={!text.trim() || asking}>
          {asking ? t("textEntry.sending") : t("textEntry.send")}
        </button>
      </form>

      <MovementResult done={done} state={{}} refreshedHint="" />

      {reply && (
        <div className="chat">
          <p className="bubble bubble-you">
            <span className="bubble-who">{t("textEntry.you")}</span>
            {reply.asked}
          </p>
          <div className="bubble bubble-system">
            <span className="bubble-who">{t("textEntry.system")}</span>
            {reply.error && (
              <p className="form-error" role="alert">
                {reply.error}
              </p>
            )}
            {reply.proposal && (
              <ProposalForm
                key={reply.round}
                proposal={reply.proposal}
                data={data}
                onDone={(movement) => {
                  setDone(movement);
                  setReply(null);
                  setText("");
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProposalFormProps {
  proposal: Proposal;
  data: ChecklistData;
  onDone: (movement: DoneMovement) => void;
}

/** Propozycja do poprawienia i zatwierdzenia ✓: rodzaj, budowa, pytania, narzędzia i to, czego nie rozpoznano. */
function ProposalForm({ proposal, data, onDone }: ProposalFormProps) {
  const [draft, setDraft] = useState<Draft>(() => startDraft(proposal, data));
  const [query, setQuery] = useState("");
  // Ponowne wysłanie tego samego ruchu (np. po zerwanym połączeniu) idzie pod tym samym
  // identyfikatorem operacji, więc się nie zdubluje; poprawiony ruch dostaje nowy.
  const operationIds = useRef(new Map<string, string>());
  const submitted = useRef<{ summary: string } | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ChecklistState, formData: FormData) => {
    const result = await confirmProposal(prev, formData);
    if (result.done && submitted.current) onDone({ summary: submitted.current.summary, notified: result.done.notified });
    return result;
  }, {});

  const plan = planDraft(draft, proposal, data);
  const codes = plan.tools.map((tool) => tool.code).join(", ");
  const summary = plan.to ? t("checklist.summary", { codes, place: plan.to.name }) : "";
  const siteLegend = draft.kind === "zwrot" ? t("checklist.kinds.zwrot.from") : t(`checklist.kinds.${draft.kind}.to`);
  const addable = plan.addable.filter((tool) => matchesTool(tool, query));

  function change(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function remove(toolId: string) {
    setDraft((current) => ({
      ...current,
      toolIds: current.toolIds.filter((id) => id !== toolId),
      picks: current.picks.map((picked) => picked.filter((id) => id !== toolId)),
    }));
  }

  function pick(index: number, toolId: string, quantity: number) {
    setDraft((current) => {
      const picked = current.picks[index] ?? [];
      const next = picked.includes(toolId)
        ? picked.filter((id) => id !== toolId)
        : quantity === 1
          ? [toolId]
          : [...picked, toolId].slice(-quantity);
      return { ...current, picks: current.picks.map((entry, i) => (i === index ? next : entry)) };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan.ready || !plan.from || !plan.to) return;
    const signature = [draft.kind, plan.from.id, plan.to.id, ...plan.tools.map((tool) => tool.id).sort()].join(" ");
    const formData = new FormData(event.currentTarget);
    let operationId = operationIds.current.get(signature);
    if (!operationId) {
      operationId = newOperationId();
      operationIds.current.set(signature, operationId);
    }
    formData.set("operationId", operationId);
    submitted.current = { summary };
    startTransition(() => formAction(formData));
  }

  return (
    <form className="proposal" aria-label={t("textEntry.proposalLabel")} onSubmit={submit}>
      <input type="hidden" name="text" value={proposal.text} />
      <input type="hidden" name="kind" value={draft.kind} />
      <input type="hidden" name="fromLocationId" value={plan.from?.id ?? ""} />
      <input type="hidden" name="toLocationId" value={plan.to?.id ?? ""} />
      {plan.tools.map((tool) => (
        <input key={tool.id} type="hidden" name="toolId" value={tool.id} />
      ))}

      <p>{t("textEntry.understood")}</p>

      {plan.kinds.length > 1 && (
        <fieldset className="checklist-section">
          <legend className="scan-legend">{t("scanner.kind")}</legend>
          <div className="choice-list choice-row">
            {plan.kinds.map((kind) => (
              <label key={kind} className="choice">
                <input type="radio" name="kindChoice" checked={kind === draft.kind} onChange={() => change({ kind })} />
                <span className="choice-name">{t(`movementKind.${kind}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="checklist-section">
        <legend className="scan-legend">{siteLegend}</legend>
        {proposal.site && !plan.sites.some((site) => site.id === proposal.site!.id) && draft.siteId === "" && (
          <p className="proposal-note">{t("textEntry.siteNotAllowed", { site: proposal.site.name })}</p>
        )}
        <div className="choice-list">
          {plan.sites.map((site) => (
            <label key={site.id} className="choice">
              <input type="radio" name="siteChoice" checked={site.id === plan.site?.id} onChange={() => change({ siteId: site.id })} />
              <span className="choice-name">{site.name}</span>
              {site.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {proposal.ambiguities.map((question, index) => {
        const candidates = question.candidates.filter((candidate) => !draft.toolIds.includes(candidate.id));
        return (
          <fieldset key={index} className="checklist-section">
            <legend className="scan-legend">
              {question.quantity === 1
                ? t("textEntry.questionOne", { phrase: question.phrase })
                : t("textEntry.question", { phrase: question.phrase, count: question.quantity })}
            </legend>
            <div className="proposal-options">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={draft.picks[index]?.includes(candidate.id) ? "button" : "button button-quiet"}
                  aria-pressed={draft.picks[index]?.includes(candidate.id) ?? false}
                  onClick={() => pick(index, candidate.id, question.quantity)}
                >
                  {t("checklist.toolLabel", { code: candidate.code, name: candidate.name })}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}

      <fieldset className="checklist-section">
        <legend className="scan-legend">{t("checklist.tools")}</legend>
        {plan.tools.length === 0 ? (
          <p className="empty">{t("textEntry.noTools")}</p>
        ) : (
          <ul className="scan-tools">
            {plan.tools.map((tool) => (
              <li key={tool.id} className="scan-tool">
                <span className="plate">{tool.code}</span>
                <span className="tool-row-name">{tool.name}</span>
                <button
                  className="button button-quiet scan-remove"
                  type="button"
                  onClick={() => remove(tool.id)}
                  aria-label={t("scanner.remove", { code: tool.code })}
                  title={t("scanner.remove", { code: tool.code })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {(plan.misplaced.length > 0 || proposal.unrecognized.length > 0) && (
          <ul className="proposal-notes">
            {plan.misplaced.map((tool) => (
              <li key={tool.id}>{t("textEntry.misplaced", { code: tool.code })}</li>
            ))}
            {proposal.unrecognized.map((entry, index) => (
              <li key={index}>
                {entry.reason === "unknown"
                  ? t("textEntry.unknown", { phrase: entry.phrase })
                  : t("textEntry.unavailable", { phrase: entry.phrase, missing: entry.missing })}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {plan.addable.length > 0 && (
        <details className="proposal-add">
          <summary>{t("textEntry.add")}</summary>
          <div className="field">
            <label htmlFor="proposal-search">{t("checklist.search")}</label>
            <input
              id="proposal-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("checklist.searchPlaceholder")}
              autoComplete="off"
            />
          </div>
          {addable.length === 0 ? (
            <p className="empty">{t("checklist.noMatches")}</p>
          ) : (
            <div className="proposal-options">
              {addable.slice(0, ADDABLE_LIMIT).map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="button button-quiet"
                  aria-label={t("textEntry.addTool", { code: tool.code })}
                  onClick={() => change({ toolIds: [...draft.toolIds, tool.id] })}
                >
                  {t("checklist.toolLabel", { code: tool.code, name: tool.name })}
                </button>
              ))}
            </div>
          )}
        </details>
      )}

      <p className="checklist-summary-text" data-testid="proposal-summary">
        {t(`movementKind.${draft.kind}`)}:{" "}
        {!plan.site ? t("textEntry.chooseSite") : plan.open > 0 ? t("textEntry.answerQuestions") : summary}
      </p>
      <MovementResult done={null} state={state} refreshedHint={t("checklist.conflictRefreshed")} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={!plan.ready || pending}>
          {pending ? t("checklist.confirming") : t("checklist.confirm")}
        </button>
      </div>
    </form>
  );
}
