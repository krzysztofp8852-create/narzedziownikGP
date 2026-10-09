import { execFileSync } from "node:child_process";
import type { FullResult, Reporter } from "@playwright/test/reporter";

/**
 * Raport Playwright, który po w pełni udanym przebiegu usuwa firmy założone przez testy w tym przebiegu
 * („Test dymny …”, „Test e2e …”, „Test usuwania …”), z danymi, plikami i kontami. Po porażce albo przerwaniu zostają
 * do analizy; zostawia je też `E2E_KEEP_COMPANIES=1`. Starszych firm testowych nie rusza.
 */
export default class TestCompanyCleanup implements Reporter {
  private startedAt = new Date();

  onBegin() {
    this.startedAt = new Date();
  }

  onEnd(result: FullResult) {
    if (result.status !== "passed") {
      console.log("Firmy testowe z tego przebiegu zostają do analizy, bo testy nie przeszły.");
      return;
    }
    if (process.env.E2E_KEEP_COMPANIES === "1") return;
    // Nieudane sprzątanie nie psuje wyniku testów, tylko zostawia firmy (i mówi o tym).
    try {
      const output = execFileSync(
        "npx",
        ["tsx", "--env-file-if-exists=.env.local", "e2e/support/delete-test-companies.mts", this.startedAt.toISOString()],
        { encoding: "utf8" },
      );
      const { deleted, leftovers } = JSON.parse(output.trim().split("\n").at(-1)!) as { deleted: string[]; leftovers: number };
      console.log(`Usunięto firmy testowe z tego przebiegu: ${deleted.length}.`);
      if (leftovers > 0) console.warn(`Nie usunięto ${leftovers} plików lub kont (szczegóły w logu powyżej).`);
    } catch (error) {
      console.error("Nie usunięto firm testowych z tego przebiegu", error);
    }
  }
}
