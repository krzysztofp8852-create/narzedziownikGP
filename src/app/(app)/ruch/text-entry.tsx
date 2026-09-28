"use client";

import { type FormEvent, startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import Link from "next/link";
import { FoundToolList } from "@/components/found-tools";
import { type Proposal, SERVICE_KINDS, type WhereAnswer } from "@/interpretation/proposal";
import { enqueueRecording, isNetworkError, onQueueChanged, queueChanged, queuedFromForm, readyRecordings, sendOrQueue } from "@/lib/offline/client";
import { hasOfflineQueue } from "@/lib/offline/idb";
import type { ReadyRecording } from "@/lib/offline/queue";
import { newOperationId } from "@/lib/operation-id";
import { matchesTool } from "@/lib/tool-search";
import { type ChecklistState, confirmProposal, proposeFromRecording, proposeMovement } from "./actions";
import { type ChecklistData, DamagedWarnings, PlaceName } from "./checklist";
import { type DoneMovement, MovementResult } from "./movement-result";
import { type Draft, planDraft, startDraft } from "./proposal-draft";
import { canRecord, VoiceRecorder } from "./voice-recorder";

/** Ile narzędzi do dodania pokazujemy naraz; resztę zawęża wyszukiwanie. */
const ADDABLE_LIMIT = 8;

interface Reply {
  /** Co kierownik napisał albo co rozpoznano w nagraniu. */
  asked: string;
  spoken: boolean;
  proposal?: Proposal;
  /** Na pytanie „gdzie jest …”: gdzie jest sprzęt, o który pytano. */
  where?: WhereAnswer;
  error?: string;
  round: number;
}

/** Nagranie z kolejki offline, nad którym teraz pracujemy: ruch z niego zdarzył się w chwili nagrania. */
interface FromRecording {
  id: string;
  recordedAt: string;
  /** Bez propozycji: rozpoznany tekst jest w polu wpisu do poprawienia i wysłania. */
  correcting: boolean;
}

/**
 * Głos i wpis tekstem: kierownik mówi (przytrzymując przycisk) albo pisze zdanie, a system odpowiada
 * propozycją ruchu (rodzaj, budowa, narzędzia z kodami), pyta o niejednoznaczne narzędzia i daje ją
 * poprawić. Nic się nie zapisuje przed ✓. Nagranie bez zasięgu czeka w telefonie, a po transkrypcji
 * jego propozycja jest na liście „Nagrania do zatwierdzenia” (`recordingId` otwiera jedną z nich).
 */
export function TextEntry({ data, voice, recordingId }: { data: ChecklistData; voice: boolean; recordingId?: string }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [done, setDone] = useState<DoneMovement | null>(null);
  const [recordingQueued, setRecordingQueued] = useState(false);
  const [ready, setReady] = useState<ReadyRecording[]>([]);
  const [fromRecording, setFromRecording] = useState<FromRecording | null>(null);
  const [asking, startAsking] = useTransition();
  // Na co system właśnie odpowiada: „Słucham nagrania…” tylko przy nagraniu, a nie przy wpisanym tekście.
  const [askedBy, setAskedBy] = useState<"text" | "voice">("text");
  // Formularz otwiera się po kliknięciu, więc nie ma go w HTML z serwera.
  const [voiceAvailable] = useState(() => voice && canRecord());
  // Które nagranie z adresu (link „Do zatwierdzenia” w nagłówku) już otworzyliśmy.
  const openedFromLink = useRef<string | undefined>(undefined);

  // Przykład z budową, którą kierownik zna (najpierw własną); nazwa w mianowniku po „na budowę” zawsze brzmi dobrze.
  const exampleSite = data.places.find((place) => place.kind === "budowa" && place.mine) ?? data.places.find((place) => place.kind === "budowa");
  const placeholder = exampleSite ? t("textEntry.placeholderSite", { site: exampleSite.name }) : t("textEntry.placeholder");

  function answer(next: Omit<Reply, "round">) {
    setReply((previous) => ({ ...next, round: (previous?.round ?? 0) + 1 }));
  }

  /** Otwiera propozycję z nagrania z kolejki; bez propozycji rozpoznany tekst trafia do pola wpisu. */
  const open = useCallback(async (recording: ReadyRecording) => {
    setDone(null);
    setRecordingQueued(false);
    setFromRecording({ id: recording.id, recordedAt: recording.recordedAt, correcting: !recording.proposal });
    if (recording.text && !recording.proposal) setText(recording.text);
    setReply((previous) => ({
      asked: recording.text ?? t("voice.yourRecording"),
      spoken: true,
      proposal: recording.proposal,
      error: recording.error,
      round: (previous?.round ?? 0) + 1,
    }));
    // Sam komunikat (np. nic nie słychać) już przeczytany; tekst do poprawienia czeka, aż kierownik go wyśle.
    if (!recording.proposal && !recording.text) await forget(recording.id);
  }, []);

  useEffect(() => {
    if (!hasOfflineQueue()) return;
    const load = async () => {
      const mine = (await readyRecordings().all()).filter((item) => item.userId === data.userId);
      setReady(mine.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
      const linked = recordingId !== openedFromLink.current && mine.find((item) => item.id === recordingId);
      if (linked) {
        openedFromLink.current = recordingId;
        await open(linked);
      }
    };
    void load();
    return onQueueChanged(() => void load());
  }, [data.userId, recordingId, open]);

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = text.trim();
    if (!asked) return;
    setDone(null);
    setRecordingQueued(false);
    // Poprawiony tekst z nagrania nadal opisuje ruch z chwili nagrania; nowe zdanie już nie.
    if (fromRecording?.correcting) void forget(fromRecording.id);
    else setFromRecording(null);
    setAskedBy("text");
    startAsking(async () => {
      const result = await proposeMovement(asked);
      answer({ asked, spoken: false, ...result });
    });
  }

  function hear(audio: Blob) {
    setDone(null);
    setRecordingQueued(false);
    setFromRecording(null);
    const recordedAt = new Date();
    setAskedBy("voice");
    const queue = async () => {
      await enqueueRecording(audio, data.userId, recordedAt);
      setReply(null);
      setRecordingQueued(true);
    };
    startAsking(async () => {
      if (hasOfflineQueue() && !navigator.onLine) return queue();
      const formData = new FormData();
      formData.set("audio", audio);
      let heard: Awaited<ReturnType<typeof proposeFromRecording>>;
      try {
        heard = await proposeFromRecording(formData);
      } catch (error) {
        if (hasOfflineQueue() && isNetworkError(error)) return queue();
        throw error;
      }
      const { text: recognized, ...result } = heard;
      // Gdy nie udało się zrozumieć rozpoznanego tekstu, można go poprawić i wysłać bez mówienia od nowa.
      if (recognized && !result.proposal && !result.where) setText(recognized);
      answer({ asked: recognized ?? t("voice.yourRecording"), spoken: true, ...result });
    });
  }

  return (
    <div className="text-entry">
      {ready.length > 0 && (
        <section className="ready-recordings" aria-label={t("offline.readyTitle")}>
          <h3 className="scan-legend">{t("offline.readyTitle")}</h3>
          <div className="proposal-options">
            {ready.map((recording) => (
              <span key={recording.id} className="undo">
                <button
                  type="button"
                  className={fromRecording?.id === recording.id ? "button button-small" : "button button-quiet button-small"}
                  onClick={() => void open(recording)}
                >
                  {t("offline.readyItem", { when: formatDateTime(new Date(recording.recordedAt)) })}
                </button>
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => {
                    if (fromRecording?.id === recording.id) setReply(null);
                    void forget(recording.id);
                  }}
                >
                  {t("offline.discard")}
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      {voiceAvailable && <VoiceRecorder busy={asking} listening={asking && askedBy === "voice"} onRecorded={hear} />}
      {recordingQueued && (
        <p className="checklist-done checklist-queued" role="status">
          {t("offline.recordingQueued")}
        </p>
      )}
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
            placeholder={placeholder}
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
            <span className="bubble-who">
              {reply.spoken ? t("voice.you") : t("textEntry.you")}
              {fromRecording && ` · ${t("offline.recordedAt", { when: formatDateTime(new Date(fromRecording.recordedAt)) })}`}
            </span>
            {reply.asked}
          </p>
          <div className="bubble bubble-system">
            <span className="bubble-who">{t("textEntry.system")}</span>
            {reply.error && (
              <p className="form-error" role="alert">
                {reply.error}
              </p>
            )}
            {reply.where && <WhereReply answer={reply.where} />}
            {reply.proposal && (
              <ProposalForm
                key={reply.round}
                proposal={reply.proposal}
                data={data}
                occurredAt={fromRecording?.recordedAt}
                onDone={(movement) => {
                  setDone(movement);
                  setReply(null);
                  setText("");
                  if (fromRecording) void forget(fromRecording.id);
                  setFromRecording(null);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Odpowiedź na „gdzie jest …”: znalezione narzędzia z miejscem, dniami i odpowiedzialnym; nic tu nie zatwierdza się. */
function WhereReply({ answer }: { answer: WhereAnswer }) {
  return (
    <div className="where-answer" data-testid="where-answer">
      <p>
        {answer.tools.length > 0 ? t("search.answer", { count: answer.tools.length }) : t("search.heardNothing", { text: answer.text })}
        {answer.tools.length > 0 && answer.unrecognized.length > 0 && (
          <span className="muted"> {t("search.unrecognized", { phrases: answer.unrecognized.join(", ") })}</span>
        )}
      </p>
      {answer.tools.length > 0 && <FoundToolList tools={answer.tools} />}
      <p>
        <Link href="/szukaj">{t("search.more")}</Link>
      </p>
    </div>
  );
}

/** Propozycja z nagrania z kolejki jest zatwierdzona, odrzucona albo już pokazana: znika z telefonu. */
async function forget(recordingId: string) {
  await readyRecordings().remove(recordingId);
  queueChanged();
}

interface ProposalFormProps {
  proposal: Proposal;
  data: ChecklistData;
  /** Czas zdarzenia (ISO) przy propozycji z nagrania z kolejki offline: chwila nagrania. */
  occurredAt?: string;
  onDone: (movement: DoneMovement) => void;
}

/** Propozycja do poprawienia i zatwierdzenia ✓: rodzaj, budowa, pytania, narzędzia i to, czego nie rozpoznano. */
function ProposalForm({ proposal, data, occurredAt, onDone }: ProposalFormProps) {
  const [draft, setDraft] = useState<Draft>(() => startDraft(proposal, data));
  const [query, setQuery] = useState("");
  // Ponowne wysłanie tego samego ruchu (np. po zerwanym połączeniu) idzie pod tym samym
  // identyfikatorem operacji, więc się nie zdubluje; poprawiony ruch dostaje nowy.
  const operationIds = useRef(new Map<string, string>());
  const submitted = useRef<{ summary: string } | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ChecklistState, formData: FormData) => {
    const summary = submitted.current?.summary ?? "";
    const result = await sendOrQueue(() => confirmProposal(prev, formData), queuedFromForm(formData, { userId: data.userId, summary }));
    if (result === "queued") onDone({ summary, notified: [], queued: true });
    else if (result.done) onDone({ summary, notified: result.done.notified, movementId: result.done.movementId });
    return result === "queued" ? {} : result;
  }, {});

  const plan = planDraft(draft, proposal, data);
  const codes = plan.tools.map((tool) => tool.code).join(", ");
  const summary = plan.to ? t("checklist.summary", { codes, place: plan.to.name }) : "";
  const siteLegend =
    draft.kind === "zwrot" || draft.kind === "do_serwisu" ? t(`checklist.kinds.${draft.kind}.from`) : t(`checklist.kinds.${draft.kind}.to`);
  const serviceLegend = draft.kind === "z_serwisu" ? t("checklist.kinds.z_serwisu.from") : t("checklist.kinds.do_serwisu.to");
  const serviceKind = SERVICE_KINDS.includes(draft.kind);
  const addable = plan.addable.filter((tool) => matchesTool(tool, query));

  function change(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function remove(toolId: string) {
    setDraft((current) => ({
      ...current,
      toolIds: current.toolIds.filter((id) => id !== toolId),
      picks: current.picks.map((picked) => picked.filter((id) => id !== toolId)),
      excluded: current.everything ? [...current.excluded, toolId] : current.excluded,
    }));
  }

  function add(toolId: string) {
    setDraft((current) =>
      current.everything
        ? { ...current, excluded: current.excluded.filter((id) => id !== toolId) }
        : { ...current, toolIds: [...current.toolIds, toolId] },
    );
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
      {occurredAt && <input type="hidden" name="occurredAt" value={occurredAt} />}
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

      {draft.kind !== "z_serwisu" && (
        <fieldset className="checklist-section">
          <legend className="scan-legend">{siteLegend}</legend>
          {proposal.site && !plan.sites.some((site) => site.id === proposal.site!.id) && draft.siteId === "" && (
            <p className="proposal-note">{t("textEntry.siteNotAllowed", { site: proposal.site.name })}</p>
          )}
          <div className="choice-list">
            {plan.sites.map((site) => (
              <label key={site.id} className="choice">
                <input type="radio" name="siteChoice" checked={site.id === plan.site?.id} onChange={() => change({ siteId: site.id })} />
                <PlaceName place={site} />
                {site.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {serviceKind && (
        <fieldset className="checklist-section">
          <legend className="scan-legend">{serviceLegend}</legend>
          {plan.services.length === 0 ? (
            <p className="empty">{t("checklist.kinds.do_serwisu.noTo")}</p>
          ) : (
            <div className="choice-list">
              {plan.services.map((service) => (
                <label key={service.id} className="choice">
                  <input
                    type="radio"
                    name="serviceChoice"
                    checked={service.id === plan.service?.id}
                    onChange={() => change({ serviceId: service.id })}
                  />
                  <PlaceName place={service} />
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {/* Przy „wszystko z …” przeniesienie nie ma narzędzi, z których wynika skąd, więc wybiera się to wprost. */}
      {draft.kind === "przeniesienie" && draft.everything && (
        <fieldset className="checklist-section">
          <legend className="scan-legend">{t("checklist.kinds.przeniesienie.from")}</legend>
          <div className="choice-list">
            {plan.sources.map((place) => (
              <label key={place.id} className="choice">
                <input type="radio" name="fromChoice" checked={place.id === plan.from?.id} onChange={() => change({ fromId: place.id })} />
                <PlaceName place={place} />
                {place.mine && <span className="choice-tag">{t("checklist.mine")}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

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
        {draft.everything && (
          <p className="proposal-note">
            {plan.from ? t("textEntry.everything", { place: plan.from.name }) : t("textEntry.everythingChooseFrom")}
          </p>
        )}
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
                  onClick={() => add(tool.id)}
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
        {draft.kind !== "z_serwisu" && !plan.site
          ? t(draft.kind === "do_serwisu" ? "textEntry.chooseFrom" : "textEntry.chooseSite")
          : serviceKind && !plan.service
            ? t("textEntry.chooseService")
            : !plan.from && draft.everything
              ? t("textEntry.chooseFrom")
              : plan.open > 0
                ? t("textEntry.answerQuestions")
                : summary}
      </p>
      <DamagedWarnings tools={plan.tools} kind={draft.kind} />
      <MovementResult done={null} state={state} refreshedHint={t("checklist.conflictRefreshed")} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={!plan.ready || pending}>
          {pending ? t("checklist.confirming") : t("checklist.confirm")}
        </button>
      </div>
    </form>
  );
}
