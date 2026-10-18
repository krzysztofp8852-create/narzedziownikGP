import Link from "next/link";
import type { ReactNode } from "react";
import type { EmptyStep } from "@/lib/empty-step";
import { ScanLink } from "./scan-link";

/**
 * Pusty ekran w całym programie: jedno zdanie, co tu będzie, i najwyżej jeden kolejny krok (`emptyStep`). Przycisk widzi
 * tylko ten, kto może to zrobić, a pozostali zdanie, kto może.
 */
export function EmptyState({ children, step }: { children: ReactNode; step?: EmptyStep | null }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {step?.kind === "link" && (
        <Link href={step.href} className="button">
          {step.label}
        </Link>
      )}
      {step?.kind === "scan" && <ScanLink className="button">{step.label}</ScanLink>}
      {step?.kind === "who" && <p className="empty-who">{step.text}</p>}
    </div>
  );
}
