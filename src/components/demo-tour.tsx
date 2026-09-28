"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DemoRole } from "@/demo/company";
import { t } from "@/i18n/t";

/** Kroki przewodnika i elementy tablicy, które pokazują (`data-tour`); bez elementu dymek jest na środku ekranu. */
const STEPS = {
  welcome: null,
  roles: "demo-roles",
  offBase: "off-base",
  alarms: "alarms",
  alarmTool: "alarm-tool",
  search: "search",
  toolReports: "tool-reports",
  operationsOwner: "operations",
  operationsManager: "operations",
  operationsStorekeeper: "operations",
  recent: "recent",
  recentWorker: "recent",
  map: "map",
  lost: "lost",
  issues: "issues",
  issuesWorker: "issues",
  bell: "bell",
  settings: "settings",
  finish: null,
} as const;

type StepId = keyof typeof STEPS;

/** Kroki, których element zależy od danych firmy (alarm, zgłoszenia narzędzi, zaginione). */
const DATA_STEPS = new Set<StepId>(["alarmTool", "toolReports", "lost"]);

const ROLE_STEPS: Record<DemoRole, StepId[]> = {
  wlasciciel: [
    "welcome",
    "roles",
    "offBase",
    "alarms",
    "toolReports",
    "alarmTool",
    "search",
    "operationsOwner",
    "map",
    "lost",
    "issues",
    "bell",
    "settings",
    "finish",
  ],
  kierownik: ["welcome", "roles", "alarms", "alarmTool", "search", "operationsManager", "recent", "bell", "issues", "finish"],
  magazynier: ["welcome", "roles", "operationsStorekeeper", "recent", "alarmTool", "search", "issues", "finish"],
  // Pracownik nie rejestruje ruchów, więc nie ma czego cofać.
  pracownik: ["welcome", "roles", "alarmTool", "search", "issuesWorker", "recentWorker", "finish"],
};

/** Adres, który włącza przewodnik od początku (przycisk „Przewodnik” na pasku demo). */
export const DEMO_TOUR_HREF = "/?przewodnik=1";

// W tej przeglądarce: pominięty przewodnik nie włącza się sam w żadnej roli, a w każdej roli pamiętamy krok albo koniec.
const SKIPPED_KEY = "demo-przewodnik:pominiety";
const roleKey = (role: DemoRole) => `demo-przewodnik:${role}`;
const DONE = "koniec";

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

const target = (id: StepId) => {
  const name = STEPS[id];
  return name ? document.querySelector<HTMLElement>(`[data-tour="${name}"]`) : null;
};

const CARD_WIDTH = 360;
const GAP = 12;
const EDGE = 16;
/** Od tej szerokości dymek stoi przy elemencie; węższy ekran ma go na dole. */
const WIDE = 640;

interface Layout {
  ring: CSSProperties | null;
  card: CSSProperties | null;
}

/**
 * Przewodnik po tablicy w firmie demo: dymki „kliknij tu, zobacz to” z podświetleniem elementu, osobne dla
 * każdej roli. Włącza się sam przy pierwszym wejściu do roli, można go pominąć w każdym kroku, a przycisk
 * „Przewodnik” na pasku demo włącza go od nowa. Strona pod spodem cały czas działa.
 */
export function DemoTour({ role }: { role: DemoRole }) {
  const pathname = usePathname();
  const requested = useSearchParams().has("przewodnik");
  const router = useRouter();
  const onBoard = pathname === "/";
  const [steps, setSteps] = useState<StepId[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout>({ ring: null, card: null });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const begin = useCallback(
    (from: number) => {
      // Bez kroków, których sekcji tablica akurat nie pokazuje (np. bez zgłoszeń narzędzi); stałe elementy zostają,
      // bo w trakcie odświeżania tablicy mogą na chwilę zniknąć, a wtedy dymek stoi na środku ekranu.
      const available = ROLE_STEPS[role].filter((id) => !DATA_STEPS.has(id) || target(id));
      setSteps(available);
      setIndex(Math.min(Math.max(from, 0), available.length - 1));
    },
    [role],
  );

  useEffect(() => {
    if (!onBoard) return;
    // W następnej klatce: kroki zależą od tego, co tablica już pokazała, i od pamięci przeglądarki.
    const frame = requestAnimationFrame(() => {
      if (requested) {
        begin(0);
        router.replace("/", { scroll: false });
        return;
      }
      // Po powrocie na tablicę z karty narzędzia przewodnik idzie dalej od tego samego kroku.
      if (index !== null || read(SKIPPED_KEY)) return;
      const saved = read(roleKey(role));
      if (saved !== DONE) begin(Number(saved) || 0);
    });
    return () => cancelAnimationFrame(frame);
    // Tylko przy wejściu na tablicę i na żądanie; kolejne kroki zmieniają `index` bez restartu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBoard, requested]);

  useEffect(() => {
    if (index !== null) write(roleKey(role), String(index));
  }, [index, role]);

  const id = index === null ? null : steps[index];
  const visible = onBoard && id !== null;

  useLayoutEffect(() => {
    if (!visible || !id) return;
    const element = target(id);
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
      });
    };
    if (element) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Na telefonie dymek zasłania dół ekranu, więc element idzie pod górną krawędź.
      element.scrollIntoView({ block: window.innerWidth >= WIDE ? "center" : "start", behavior: smooth ? "smooth" : "auto" });
    }
    update();
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [visible, id]);

  useEffect(() => {
    if (visible) nextRef.current?.focus({ preventScroll: true });
  }, [visible, id]);

  const close = useCallback(
    (skipped: boolean) => {
      write(roleKey(role), DONE);
      if (skipped) write(SKIPPED_KEY, "1");
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
      if (event.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  if (!visible || index === null || !id) return null;
  const cardClass = layout.card ? "demo-tour-card" : layout.ring ? "demo-tour-card demo-tour-sheet" : "demo-tour-card demo-tour-center";
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
          {t(`demo.tour.${id}.title`)}
        </h2>
        <p id="demo-tour-text">{t(`demo.tour.${id}.text`)}</p>
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
          <button ref={nextRef} type="button" className="button button-small" onClick={next}>
            {last ? t("demo.tour.done") : t("demo.tour.next")}
          </button>
        </div>
      </div>
    </>
  );
}
