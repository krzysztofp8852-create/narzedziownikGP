"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { formatDateTime, formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { matchesTool } from "@/lib/tool-search";
import type { StickerCandidate } from "@/registry/registry";
import { STICKER_LAYOUTS, type StickerLayoutId, stickersPerSheet } from "@/stickers/layouts";

const LAYOUT_IDS = Object.keys(STICKER_LAYOUTS) as StickerLayoutId[];

/** Wymiar w mm z przecinkiem dziesiętnym, np. 29,7. */
function formatMillimeters(value: number) {
  return String(value).replace(".", ",");
}

/** Wybór arkusza A4 i pierwszej wolnej naklejki na nim (pola `layout` i `firstPosition`). */
function SheetFields({ idPrefix }: { idPrefix: string }) {
  const [layoutId, setLayoutId] = useState<StickerLayoutId>(LAYOUT_IDS[0]);
  return (
    <div className="field-row">
      <div className="field">
        <label htmlFor={`${idPrefix}-layout`}>{t("stickers.layout")}</label>
        <select
          id={`${idPrefix}-layout`}
          name="layout"
          value={layoutId}
          onChange={(event) => setLayoutId(event.target.value as StickerLayoutId)}
        >
          {LAYOUT_IDS.map((id) => (
            <option key={id} value={id}>
              {t("stickers.layoutOption", {
                count: stickersPerSheet(id),
                width: formatMillimeters(STICKER_LAYOUTS[id].width),
                height: formatMillimeters(STICKER_LAYOUTS[id].height),
              })}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-position`}>{t("stickers.firstPosition")}</label>
        <input
          id={`${idPrefix}-position`}
          name="firstPosition"
          type="number"
          inputMode="numeric"
          min={1}
          max={stickersPerSheet(layoutId)}
          defaultValue={1}
          required
        />
        <small>{t("stickers.firstPositionHint")}</small>
      </div>
    </div>
  );
}

type DownloadState = { status: "idle" } | { status: "pending" } | { status: "done"; count: number } | { status: "error"; message: string };

/**
 * Wysyła formularz do generatora PDF i zapisuje plik. Po pobraniu odświeża stronę, bo wydrukowane
 * naklejki przestają być nieoklejone.
 */
function usePdfDownload() {
  const router = useRouter();
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>, onDone?: () => void) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const body = new FormData(event.currentTarget, submitter);
    setState({ status: "pending" });
    try {
      const response = await fetch("/naklejki/pdf", { method: "POST", body });
      if (response.headers.get("Content-Type") !== "application/pdf") {
        const { error } = await response.json().catch(() => ({ error: t("errors.unexpected") }));
        setState({ status: "error", message: error ?? t("errors.unexpected") });
        return;
      }
      const fileName = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? t("stickers.fileName", { day: formatDay(new Date()) });
      saveFile(await response.blob(), fileName);
      setState({ status: "done", count: Number(response.headers.get("X-Sticker-Count")) });
      onDone?.();
      router.refresh();
    } catch {
      setState({ status: "error", message: t("errors.unexpected") });
    }
  }

  return { state, submit, pending: state.status === "pending" };
}

function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Przeglądarka zaczyna pobieranie po kliknięciu; adres zwalniamy chwilę później.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function DownloadStatus({ state }: { state: DownloadState }) {
  if (state.status === "done") {
    return (
      <p className="checklist-done" role="status">
        {t("stickers.downloaded", { count: state.count })}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="form-error" role="alert">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Arkusz naklejek: wszystkie nieoklejone jednym przyciskiem albo zaznaczone narzędzia. */
export function StickerSheetForm({ candidates }: { candidates: StickerCandidate[] }) {
  const { state, submit, pending } = usePdfDownload();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const unlabeled = candidates.filter((candidate) => candidate.printedAt === null).length;
  const visible = candidates.filter((candidate) => matchesTool(candidate, query));
  // Po odświeżeniu listy zaznaczenie zostaje tylko przy narzędziach, które nadal na niej są.
  const selected = selectedIds.filter((id) => candidates.some((candidate) => candidate.toolId === id));

  function toggle(toolId: string, checked: boolean) {
    setSelectedIds((ids) => (checked ? [...ids, toolId] : ids.filter((id) => id !== toolId)));
  }

  if (candidates.length === 0) return <p className="empty">{t("stickers.noCandidates")}</p>;

  return (
    <form className="checklist" onSubmit={(event) => submit(event, () => setSelectedIds([]))}>
      <SheetFields idPrefix="sheet" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="toolId" value={id} />
      ))}

      <section className="checklist-section" aria-labelledby="stickers-unlabeled">
        <h2 id="stickers-unlabeled" className="display section-title">
          {t("stickers.unlabeledTitle")}
        </h2>
        {unlabeled === 0 ? (
          <p className="empty">{t("stickers.noUnlabeled")}</p>
        ) : (
          <>
            <p className="muted">{t("stickers.unlabeledHint")}</p>
            <p>
              <button className="button" type="submit" name="selection" value="unlabeled" disabled={pending}>
                {t("stickers.printUnlabeled", { count: unlabeled })}
              </button>
            </p>
          </>
        )}
      </section>

      <section className="checklist-section" aria-labelledby="stickers-selected">
        <h2 id="stickers-selected" className="display section-title">
          {t("stickers.selectedTitle")}
        </h2>
        <p className="muted">{t("stickers.selectedHint")}</p>
        <div className="field">
          <label htmlFor="stickers-search">{t("stickers.search")}</label>
          <input id="stickers-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <ul className="tool-list">
          {visible.map((candidate) => (
            <li key={candidate.toolId}>
              <label className="tool-row tool-check">
                <input
                  type="checkbox"
                  checked={selected.includes(candidate.toolId)}
                  onChange={(event) => toggle(candidate.toolId, event.target.checked)}
                  aria-label={t("checklist.toolLabel", { code: candidate.code, name: candidate.name })}
                />
                <span className="plate">{candidate.code}</span>
                <span className="tool-row-name">
                  {candidate.name}
                  <span className="tool-row-sub muted">{candidate.location}</span>
                </span>
                <span className="tool-row-days">
                  {candidate.printedAt ? (
                    t("stickers.printedAt", { when: formatDateTime(candidate.printedAt) })
                  ) : (
                    <span className="tag">{t("stickers.notPrinted")}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="checklist-summary">
        <DownloadStatus state={state} />
        <div className="form-actions">
          <button className="button" type="submit" name="selection" value="selected" disabled={selected.length === 0 || pending}>
            {pending ? t("stickers.preparing") : t("stickers.printSelected", { count: selected.length })}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Dodruk jednej naklejki z karty narzędzia, np. na wolnym miejscu napoczętego arkusza. */
export function StickerReprintForm({ toolId }: { toolId: string }) {
  const { state, submit, pending } = usePdfDownload();
  return (
    <form className="stack-form" onSubmit={(event) => submit(event)}>
      <p className="muted">{t("stickers.reprintHint")}</p>
      <input type="hidden" name="toolId" value={toolId} />
      <SheetFields idPrefix="reprint" />
      <DownloadStatus state={state} />
      <p>
        <button className="button" type="submit" name="selection" value="selected" disabled={pending}>
          {pending ? t("stickers.preparing") : t("stickers.reprint")}
        </button>
      </p>
    </form>
  );
}
