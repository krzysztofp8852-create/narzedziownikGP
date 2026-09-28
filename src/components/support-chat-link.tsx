"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SUPPORT_CHAT_OPEN } from "@/lib/support-chat-text";

/**
 * Ikona 💬 w nagłówku. Otwarcie przekazuje ekran, z którego użytkownik pisze (kontekst dla supportu). Zwykły
 * odnośnik, a nie `Link`: otwarcie czyta odpowiedzi i przeładowuje licznik, więc nie może iść przy prefetchu.
 */
export function SupportChatLink({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  const href = pathname.startsWith("/czat") ? SUPPORT_CHAT_OPEN : `${SUPPORT_CHAT_OPEN}?ekran=${encodeURIComponent(pathname)}`;
  return (
    <a href={href} className="button button-quiet icon-button bell-button" aria-label={label} title={label}>
      {children}
    </a>
  );
}
