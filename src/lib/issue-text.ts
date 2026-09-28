import { t } from "@/i18n/t";
import type { IssueEntry, IssueSubject } from "@/registry/registry";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Czego dotyczy zgłoszenie, np. „Uszkodzenie W-02 Wiertarka Makita”, „Brak / zaginięcie, Rataje”. */
export function issueSubjectText(subject: IssueSubject): string {
  const kind = t(`issues.kind.${subject.kind}`);
  if (subject.tool) return t("issues.subject.tool", { kind, code: subject.tool.code, name: subject.tool.name });
  if (subject.place) return t("issues.subject.place", { kind, place: subject.place });
  return t("issues.subject.none", { kind });
}

/** Narzędzie albo lokalizacja zgłoszenia, np. „W-02 Wiertarka Makita”, „Rataje”; pusty, gdy nie dotyczy niczego. */
export function issueTargetText({ tool, place }: Pick<IssueSubject, "tool" | "place">): string {
  if (tool) return t("issues.subjectTool", { code: tool.code, name: tool.name });
  return place ?? "";
}

/** Tekst wpisu okna 📋 (także w powiadomieniu push): nagłówek i jedno zdanie szczegółów. */
export function issueEntryText(entry: IssueEntry): { title: string; body: string } {
  if (entry.kind === "zgloszenie_narzedzia") {
    return {
      title: t("issues.entry.toolReport", { code: entry.code, name: entry.name }),
      body: t("issues.entry.toolReportBody", { author: entry.author, place: entry.place }),
    };
  }
  return {
    title: t(`issues.entry.${entry.kind}`, { subject: issueSubjectText(entry.issue) }),
    body: t("issues.entry.body", { author: entry.author, text: entry.text }),
  };
}

/** Dokąd prowadzi wpis: otwarcie zgłoszenia (czyta jego wpisy) albo zgłoszone narzędzie w oknie 📋. */
export function issueEntryLink(entry: IssueEntry): string {
  return entry.kind === "zgloszenie_narzedzia" ? `/zgloszenia#narzedzie-${entry.toolId}` : issueOpenLink(entry.issueId);
}

/** Otwarcie zgłoszenia: jego wpisy w oknie 📋 stają się przeczytane. */
export function issueOpenLink(issueId: string): string {
  return `/zgloszenia/${issueId}/otworz`;
}

/** „dziś”, „wczoraj”, „3 dni temu” od zgłoszenia uszkodzenia. */
export function damagedAgo(since: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
  if (days === 0) return t("damagedAgo.today");
  if (days === 1) return t("damagedAgo.yesterday");
  return t("damagedAgo.days", { days });
}
