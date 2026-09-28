"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { FoundToolList } from "@/components/found-tools";
import { t } from "@/i18n/t";
import { matchesTool, type SearchTool } from "@/lib/tool-search";
import { canRecord, VoiceRecorder } from "../ruch/voice-recorder";
import { findByVoice } from "./actions";

/** Wynik pytania głosem: co usłyszeliśmy i które narzędzia z listy pasują. */
interface Heard {
  text: string;
  toolIds: string[];
  unrecognized: string[];
}

const noSubscription = () => () => {};

/**
 * Wyszukiwarka „gdzie jest narzędzie”: pole zawęża listę od razu (kod, nazwa, marka, model, kategoria), a przytrzymany
 * przycisk pyta głosem, także slangiem („flex”, „niwela”). Pytanie głosem przechodzi przez Interpretację na serwerze.
 */
export function ToolFinder({ tools, voice, initialQuery }: { tools: SearchTool[]; voice: boolean; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  // Mikrofon sprawdza dopiero przeglądarka: w HTML z serwera przycisku nie ma, więc nie ma rozjazdu przy hydracji.
  const recordable = useSyncExternalStore(noSubscription, canRecord, () => false);

  function type(next: string) {
    setQuery(next);
    setHeard(null);
    setError(null);
  }

  function hear(audio: Blob) {
    setError(null);
    startAsking(async () => {
      const formData = new FormData();
      formData.set("audio", audio);
      const { answer, error } = await findByVoice(formData);
      if (!answer) return setError(error ?? t("search.failed"));
      setQuery("");
      setHeard({ text: answer.text, toolIds: answer.tools.map((tool) => tool.id), unrecognized: answer.unrecognized });
    });
  }

  const shown = heard ? tools.filter((tool) => heard.toolIds.includes(tool.id)) : tools.filter((tool) => matchesTool(tool, query));
  const typed = query.trim();

  return (
    <div className="tool-finder">
      <div className="field">
        <label htmlFor="search-query">{t("search.label")}</label>
        <input
          id="search-query"
          type="search"
          value={query}
          onChange={(event) => type(event.target.value)}
          placeholder={t("search.placeholder")}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby="search-hint"
          aria-controls="search-results"
        />
        <small id="search-hint">{t("search.hint")}</small>
      </div>
      {voice && recordable && <VoiceRecorder busy={asking} onRecorded={hear} hint={t("search.voiceHint")} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section id="search-results" className="found" aria-live="polite" aria-label={t("search.title")}>
        {heard ? (
          <div className="found-head">
            <p>
              <strong>{shown.length > 0 ? t("search.heard", { text: heard.text }) : t("search.heardNothing", { text: heard.text })}</strong>
              {heard.unrecognized.length > 0 && shown.length > 0 && (
                <span className="muted"> {t("search.unrecognized", { phrases: heard.unrecognized.join(", ") })}</span>
              )}
            </p>
            <button type="button" className="button button-quiet button-small" onClick={() => type("")}>
              {t("search.clearVoice")}
            </button>
          </div>
        ) : (
          <p className="muted" data-testid="search-count">
            {typed ? t("search.count", { count: shown.length }) : t("search.all", { count: shown.length })}
          </p>
        )}
        {!heard && typed && shown.length === 0 ? (
          <p className="empty">{t("search.noMatches", { query: typed })}</p>
        ) : (
          shown.length > 0 && <FoundToolList tools={shown} />
        )}
      </section>
    </div>
  );
}
