"use client";

import type { ReactNode } from "react";
import { useHasPlugin } from "@/lib/platform";

/**
 * Link do pliku programu (dokument terminu albo uprawnienia, zdjęcie zgłoszenia lub z czatu). W przeglądarce otwiera
 * plik w nowej karcie. W aplikacji kart nie ma: plik pobiera skorupa do „Pobranych” i otwiera w systemowej aplikacji,
 * a strona, z której przyszedł, zostaje (#124). Starsza wersja aplikacji bez wtyczki pobierania plików nie pobiera,
 * więc otwiera plik jak dotąd.
 */
export function FileLink({ href, children }: { href: string; children: ReactNode }) {
  const downloadsInApp = useHasPlugin("Downloads");
  return downloadsInApp ? (
    <a href={href} download>
      {children}
    </a>
  ) : (
    <a href={href} target="_blank" rel="noopener">
      {children}
    </a>
  );
}
