"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { supportChatOpenLink } from "@/lib/support-chat-text";

/**
 * Ikona 💬 w nagłówku. Otwarcie przekazuje ekran, z którego użytkownik pisze (kontekst dla supportu). Zwykły
 * odnośnik, a nie `Link`: otwarcie czyta odpowiedzi i przeładowuje licznik, więc nie może iść przy prefetchu.
 */
export function SupportChatLink({ label, children }: { label: string; children: ReactNode }) {
  return (
    <a href={supportChatOpenLink(usePathname())} className="button button-quiet icon-button bell-button" aria-label={label} title={label}>
      {children}
    </a>
  );
}
