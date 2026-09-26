import "server-only";
import { createClaudeInterpreter } from "@/interpretation/claude-interpreter";
import { createInterpretation, InterpretationFailedError, type Interpreter } from "@/interpretation/interpretation";
import { keywordInterpreter } from "@/interpretation/keyword-interpreter";
import { serverEnv } from "./env";
import { getRegistry } from "./registry-instance";

let interpretation: ReturnType<typeof createInterpretation> | undefined;

/** Czy wpis tekstem jest włączony (jest klucz Anthropic API albo lokalna interpretacja słów kluczowych). */
export function textEntryEnabled() {
  return serverEnv.interpreter() !== null;
}

/** Moduł Interpretacja na Rejestrze aplikacji. Zatwierdzenie działa także bez dostawcy AI. */
export function getInterpretation() {
  interpretation ??= createInterpretation({ registry: getRegistry(), interpreter: interpreter() });
  return interpretation;
}

function interpreter(): Interpreter {
  const config = serverEnv.interpreter();
  if (config === "slowa") return keywordInterpreter;
  if (config) return createClaudeInterpreter({ apiKey: config.anthropicApiKey });
  return {
    interpret: async () => {
      throw new InterpretationFailedError("Wpis tekstem jest wyłączony: brak ANTHROPIC_API_KEY");
    },
  };
}
