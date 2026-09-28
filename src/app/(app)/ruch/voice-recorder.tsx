"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";

/** Po tylu sekundach nagrywanie kończy się samo; dłuższe zdanie o narzędziach to rzadkość. */
const MAX_SECONDS = 60;
/** Krótsze przytrzymanie to raczej przypadkowe dotknięcie niż zdanie. */
const MIN_MILLISECONDS = 600;
/** Mowa z telefonu: tyle wystarcza do rozpoznania, a minuta mieści się w limicie serwera z zapasem. */
const BITS_PER_SECOND = 48_000;
/** Formaty w kolejności preferencji: Android (Chrome) nagrywa webm lub ogg z Opus, iPhone (Safari) mp4. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type Phase = "idle" | "starting" | "recording";

/** Czy przeglądarka umie nagrywać (PWA na Androidzie i iPhonie od iOS 14.3). */
export function canRecord() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

interface VoiceRecorderProps {
  /** Nagranie gotowe do wysłania. */
  onRecorded: (audio: Blob) => void;
  /** System jeszcze odpowiada na poprzednie nagranie albo wpisany tekst: przycisk czeka. */
  busy: boolean;
  /** Rozpoznaje się właśnie nagranie (a nie wpisany tekst): przycisk mówi „Słucham nagrania…”. */
  listening?: boolean;
  /** Podpowiedź pod przyciskiem, zanim ktoś go przytrzyma. */
  hint?: string;
}

/**
 * Przycisk „przytrzymaj i mów”: nagrywa, dopóki palec (albo spacja) go trzyma. Mikrofon jest otwarty
 * tylko w czasie nagrania, a nagranie zostaje w pamięci strony do chwili wysłania.
 */
export function VoiceRecorder({ onRecorded, busy, listening = busy, hint: idleHint = t("voice.hint") }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const holding = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function releaseMicrophone() {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }

  // Zamknięcie formularza w trakcie nagrania: mikrofon gaśnie, a nagranie przepada. Mikrofon, który
  // włączy się dopiero po zamknięciu, gaśnie od razu, bo nikt już nie trzyma przycisku.
  useEffect(
    () => () => {
      holding.current = false;
      if (recorder.current) recorder.current.onstop = null;
      recorder.current?.stop();
      releaseMicrophone();
    },
    [],
  );

  async function start() {
    if (busy || phase !== "idle") return;
    holding.current = true;
    setHint(null);
    setPhase("starting");
    let microphone: MediaStream;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      setPhase("idle");
      setHint(error instanceof DOMException && error.name === "NotAllowedError" ? t("voice.noPermission") : t("voice.noMicrophone"));
      return;
    }
    // Za pierwszym razem przeglądarka pyta o mikrofon, a palec zwykle już puścił przycisk.
    if (!holding.current) {
      microphone.getTracks().forEach((track) => track.stop());
      setPhase("idle");
      setHint(t("voice.ready"));
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const chunks: Blob[] = [];
    const next = new MediaRecorder(microphone, { mimeType, audioBitsPerSecond: BITS_PER_SECOND });
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    next.onstop = () => {
      const duration = Date.now() - startedAt.current;
      const type = next.mimeType || chunks[0]?.type || "audio/webm";
      releaseMicrophone();
      setPhase("idle");
      if (duration < MIN_MILLISECONDS || chunks.length === 0) {
        setHint(t("voice.tooShort"));
        return;
      }
      onRecorded(new Blob(chunks, { type }));
    };
    stream.current = microphone;
    recorder.current = next;
    startedAt.current = Date.now();
    setSeconds(0);
    next.start();
    setPhase("recording");
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
  }

  function stop() {
    holding.current = false;
    clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function press(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void start();
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    void start();
  }

  function keyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    stop();
  }

  const label =
    phase === "recording"
      ? t("voice.recording", { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` })
      : busy && listening
        ? t("voice.listening")
        : t("voice.hold");

  return (
    <div className="voice">
      <button
        type="button"
        className="button voice-button"
        data-recording={phase === "recording" || undefined}
        aria-pressed={phase === "recording"}
        aria-describedby="voice-hint"
        disabled={busy}
        onPointerDown={press}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onBlur={stop}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="voice-icon" aria-hidden="true">
          🎙
        </span>
        {label}
      </button>
      <small id="voice-hint" aria-live="polite">
        {hint ?? idleHint}
      </small>
    </div>
  );
}
