"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DemoRole } from "@/demo/company";
import { t } from "@/i18n/t";
import { TOUR_DONE, type TourStep, tourStart, tourSteps } from "@/lib/demo-tour";
import type { DemoPoster } from "@/registry/registry";

/** Adres, który włącza przewodnik (przycisk „Przewodnik” na pasku demo): pominięty wznawia, skończony zaczyna od nowa. */
export const DEMO_TOUR_HREF = "/?przewodnik=1";

// W tej przeglądarce: pominięty przewodnik nie włącza się sam w żadnej roli, a w każdej roli pamiętamy krok albo koniec.
// Klucze z numerem wersji: kto widział dawny, dłuższy przewodnik, dostaje nowy od początku.
const SKIPPED_KEY = "demo-przewodnik-2:pominiety";
const roleKey = (role: DemoRole) => `demo-przewodnik-2:${role}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Bez pamięci przeglądarki przewodnik po prostu włączy się znowu.
  }
}

const target = (step: TourStep) => document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);

const CARD_WIDTH = 360;
const GAP = 12;
const EDGE = 16;
/** Od tej szerokości dymek stoi przy elemencie; węższy ekran ma go na dole. */
const WIDE = 640;

/** Pakiet firmy demo z ceną, do ostatniego kroku (`demoPlan`). */
export interface DemoTourOffer {
  name: string;
  implementation: string;
  yearly: string;
}

interface Layout {
  ring: CSSProperties | null;
  card: CSSProperties | null;
  /** Na telefonie dymek u góry ekranu, bo element jest na dole (dolny pasek nawigacji). */
  sheetTop?: boolean;
}

/**
 * Przewodnik po tablicy w firmie demo: 3–4 dymki z podświetleniem elementu, ułożone wokół jednego zadania (wydaj
 * na budowę, zobacz, u kogo jest, przyjmij zwrot; pracownik: odbij się, zgłoś usterkę). Włącza się sam przy pierwszym
 * wejściu do roli, można go pominąć w każdym kroku, a przycisk „Przewodnik” na pasku demo wznawia go od tego kroku.
 * Strona pod spodem cały czas działa. Ostatni krok podaje cenę pakietu dla firmy wielkości DemoBud i prowadzi do
 * „Chcę to u siebie”. `poster`: plakat, którego kod pracownik wpisuje w Skanuj zamiast skanu.
 */
export function DemoTour({ role, offer, poster }: { role: DemoRole; offer: DemoTourOffer; poster: DemoPoster | null }) {
  const pathname = usePathname();
  const requested = useSearchParams().has("przewodnik");
  const router = useRouter();
  const onBoard = pathname === "/";
  const steps = useMemo(() => tourSteps(role), [role]);
  const [index, setIndex] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout>({ ring: null, card: null });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const offerRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!onBoard) return;
    // W następnej klatce: pamięć przeglądarki czyta dopiero przeglądarka.
    const frame = requestAnimationFrame(() => {
      if (requested) router.replace("/", { scroll: false });
      // Po powrocie na tablicę z innej strony przewodnik idzie dalej od tego samego kroku.
      else if (index !== null) return;
      const start = tourStart({ requested, saved: read(roleKey(role)), skipped: read(SKIPPED_KEY) !== null, count: steps.length });
      if (start !== null) setIndex(start);
    });
    return () => cancelAnimationFrame(frame);
    // Tylko przy wejściu na tablicę i na żądanie; kolejne kroki zmieniają `index` bez restartu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBoard, requested]);

  useEffect(() => {
    if (index !== null) write(roleKey(role), String(index));
  }, [index, role]);

  const step = index === null ? null : steps[index];
  const visible = onBoard && step !== null;

  useLayoutEffect(() => {
    if (!visible || !step) return;
    let element = target(step);
    const show = (shown: HTMLElement) => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Na telefonie dymek zasłania dół ekranu, więc element idzie pod górną krawędź.
      shown.scrollIntoView({ block: window.innerWidth >= WIDE ? "center" : "start", behavior: smooth ? "smooth" : "auto" });
    };
    const update = () => {
      const width = Math.min(CARD_WIDTH, window.innerWidth - 2 * EDGE);
      const height = cardRef.current?.offsetHeight ?? 200;
      const rect = element?.getBoundingClientRect() ?? null;
      let card: CSSProperties | null = null;
      if (rect && window.innerWidth >= WIDE) {
        const below = rect.bottom + GAP;
        const above = rect.top - GAP - height;
        const top =
          below + height <= window.innerHeight - EDGE ? below : above >= EDGE ? above : window.innerHeight - height - EDGE;
        card = { top, left: Math.min(Math.max(rect.left, EDGE), window.innerWidth - width - EDGE), width };
      }
      setLayout({
        ring: rect && { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 },
        card,
        sheetTop: !card && !!rect && rect.top > window.innerHeight / 2,
      });
    };
    if (element) show(element);
    update();
    // Przewodnik stoi w układzie, więc tablica może się jeszcze wczytywać, a po zapisie odświeża się na nowo: dymek
    // czeka na środku, aż element się pojawi, i przechodzi do nowego, gdy stary zniknie.
    const observer = new MutationObserver(() => {
      if (element?.isConnected) return;
      const before = element;
      element = target(step);
      if (!before && !element) return;
      if (!before && element) show(element);
      update();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [visible, step]);

  useEffect(() => {
    if (visible) (offerRef.current ?? nextRef.current)?.focus({ preventScroll: true });
  }, [visible, step]);

  // Pominięty zostaje na swoim kroku, żeby „Przewodnik” go wznowił; skończony zaczyna potem od początku.
  const close = useCallback(
    (skipped: boolean) => {
      if (skipped) write(SKIPPED_KEY, "1");
      else write(roleKey(role), TOUR_DONE);
      setIndex(null);
    },
    [role],
  );
  const last = index !== null && index === steps.length - 1;
  const next = useCallback(() => (last ? close(false) : setIndex((current) => (current ?? 0) + 1)), [last, close]);
  const back = () => setIndex((current) => Math.max((current ?? 0) - 1, 0));

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape na ostatnim kroku to koniec, a nie pominięcie: „Przewodnik” zacznie potem od początku.
      if (event.key === "Escape") close(!last);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close, last]);

  if (!visible || index === null || !step) return null;
  const cardClass = layout.card
    ? "demo-tour-card"
    : layout.ring
      ? `demo-tour-card demo-tour-sheet${layout.sheetTop ? " demo-tour-sheet-top" : ""}`
      : "demo-tour-card demo-tour-center";
  return (
    <>
      {layout.ring ? <div className="demo-tour-ring" style={layout.ring} aria-hidden /> : <div className="demo-tour-backdrop" aria-hidden />}
      <div
        ref={cardRef}
        className={cardClass}
        style={layout.card ?? undefined}
        role="dialog"
        aria-labelledby="demo-tour-title"
        aria-describedby="demo-tour-text"
        data-testid="demo-tour"
      >
        <p className="demo-tour-count">{t("demo.tour.count", { step: index + 1, count: steps.length })}</p>
        <h2 id="demo-tour-title" className="display demo-tour-title">
          {t(`demo.tour.${step.id}.title`)}
        </h2>
        <p id="demo-tour-text">
          {t(`demo.tour.${step.id}.text`, step.id === "finish" ? { ...offer } : undefined)}
          {step.id === "punch" && poster && <> {t("demo.tour.punch.code", { ...poster })}</>}
        </p>
        {index === 0 && <p className="demo-tour-hint">{t("demo.tour.resumeHint")}</p>}
        <div className="demo-tour-actions">
          {!last && (
            <button type="button" className="demo-tour-skip" onClick={() => close(true)}>
              {t("demo.tour.skip")}
            </button>
          )}
          {index > 0 && (
            <button type="button" className="button button-quiet button-small" onClick={back}>
              {t("demo.tour.back")}
            </button>
          )}
          {last ? (
            <>
              <button type="button" className="button button-quiet button-small" onClick={next}>
                {t("demo.tour.done")}
              </button>
              {/* Przewodnik kończy się przy przejściu, więc po powrocie na tablicę już się nie włączy. */}
              <Link href="/oferta" className="button button-small" ref={offerRef} onClick={() => close(false)} data-testid="demo-tour-offer">
                {t("demo.tour.offer")}
              </Link>
            </>
          ) : (
            <button ref={nextRef} type="button" className="button button-small" onClick={next}>
              {t("demo.tour.next")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
