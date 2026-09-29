"use client";

import Link from "next/link";
import { type Ref, useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";
import type { FirstStepId, Tutorial, TutorialOutcome } from "@/registry/registry";
import { closeTutorial } from "./actions";
import { type MovementEntry, type MovementRole, movementScreens } from "./screens";

/** Dokąd prowadzi każdy z pierwszych kroków właściciela. */
const FIRST_STEP_LINKS: Record<FirstStepId, string> = {
  kierownik: "/ustawienia#zespol",
  budowa: "/#budowy",
  narzedzia: "/narzedzia/import",
  naklejki: "/naklejki",
};

/** „Pomiń samouczek” i „Gotowe” w jednym formularzu: wynik niesie kliknięty przycisk. */
function CloseButton({
  outcome,
  className,
  children,
  ref,
}: {
  outcome: TutorialOutcome;
  className: string;
  children: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={ref} type="submit" name="outcome" value={outcome} className={className}>
      {children}
    </button>
  );
}

function FirstSteps({ tutorial }: { tutorial: Tutorial }) {
  const done = tutorial.firstSteps.filter((step) => step.done).length;
  const count = tutorial.firstSteps.length;
  return (
    <>
      <div className="tutorial-head">
        <p className="tutorial-kicker">{t("tutorial.title")}</p>
        <h2 id="tutorial-title" className="display tutorial-title">
          {t("tutorial.firstSteps.title")}
        </h2>
        <p className="muted">{t("tutorial.firstSteps.intro")}</p>
      </div>
      <div className="tutorial-progress">
        <progress value={done} max={count} aria-labelledby="tutorial-progress" />
        <span id="tutorial-progress" data-testid="tutorial-progress">
          {t("tutorial.firstSteps.progress", { done, count })}
        </span>
      </div>
      <ol className="tutorial-steps">
        {tutorial.firstSteps.map((step, index) => (
          <li
            key={step.id}
            className={step.done ? "tutorial-step tutorial-step-done" : "tutorial-step"}
            data-testid={`first-step-${step.id}`}
            data-done={step.done}
          >
            <span className="tutorial-step-mark" aria-hidden>
              {step.done ? "✓" : index + 1}
            </span>
            <div className="tutorial-step-body">
              <h3 className="tutorial-step-title">
                {t(`tutorial.firstSteps.${step.id}.title`)}
                {step.done && <span className="tag tag-done">{t("tutorial.firstSteps.doneTag")}</span>}
              </h3>
              <p>{t(`tutorial.firstSteps.${step.id}.text`)}</p>
              {!step.done && <Link href={FIRST_STEP_LINKS[step.id]}>{t(`tutorial.firstSteps.${step.id}.link`)} →</Link>}
            </div>
          </li>
        ))}
      </ol>
      <form action={closeTutorial} className="tutorial-actions">
        <CloseButton outcome="pominiety" className="tutorial-skip">
          {t("tutorial.skip")}
        </CloseButton>
        <CloseButton outcome="ukonczony" className="button">
          {t("tutorial.done")}
        </CloseButton>
      </form>
      <p className="muted tutorial-reopen">{t("tutorial.reopen")}</p>
    </>
  );
}

function MovementGuide({ role, entry }: { role: MovementRole; entry: MovementEntry }) {
  const screens = movementScreens(role, entry);
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const screen = screens[index];
  const last = index === screens.length - 1;

  // Po „Dalej” i „Wstecz” fokus zostaje przy przyciskach (czytnik ekranu czyta nowy krok), ale nie przy starcie.
  useEffect(() => {
    if (moved.current) nextRef.current?.focus({ preventScroll: true });
  }, [index]);
  const go = (to: number) => {
    moved.current = true;
    setIndex(to);
  };

  return (
    <>
      <div className="tutorial-head" aria-live="polite">
        <p className="tutorial-kicker">
          {t("tutorial.movements.title")} · {t("tutorial.count", { step: index + 1, count: screens.length })}
        </p>
        <h2 id="tutorial-title" className="display tutorial-title">
          {t(`tutorial.movements.${screen}.title`)}
        </h2>
        <p>{t(`tutorial.movements.${screen}.text`)}</p>
        {last && <p className="muted tutorial-reopen">{t("tutorial.reopen")}</p>}
      </div>
      <div className="tutorial-dots" aria-hidden>
        {screens.map((id, dot) => (
          <span key={id} className={dot <= index ? "tutorial-dot tutorial-dot-on" : "tutorial-dot"} />
        ))}
      </div>
      <form action={closeTutorial} className="tutorial-actions">
        {!last && (
          <CloseButton outcome="pominiety" className="tutorial-skip">
            {t("tutorial.skip")}
          </CloseButton>
        )}
        {index > 0 && (
          <button type="button" className="button button-quiet" onClick={() => go(index - 1)}>
            {t("tutorial.back")}
          </button>
        )}
        {last ? (
          <CloseButton ref={nextRef} outcome="ukonczony" className="button">
            {t("tutorial.done")}
          </CloseButton>
        ) : (
          <button ref={nextRef} type="button" className="button" onClick={() => go(index + 1)}>
            {t("tutorial.next")}
          </button>
        )}
      </form>
    </>
  );
}

/**
 * Samouczek nowego użytkownika: właściciel dostaje pierwsze kroki z postępem firmy, a kierownik i magazynier krótki
 * samouczek zapisu ruchu. Niczego nie zapisuje poza tym, że się zamknął („Pomiń samouczek” albo „Gotowe”).
 */
export function TutorialCard({ tutorial, entry }: { tutorial: Tutorial; entry: MovementEntry }) {
  return (
    <section className="tutorial" aria-labelledby="tutorial-title" data-testid="tutorial">
      {tutorial.role === "wlasciciel" ? <FirstSteps tutorial={tutorial} /> : <MovementGuide role={tutorial.role} entry={entry} />}
    </section>
  );
}
