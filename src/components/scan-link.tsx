"use client";

import type { ReactNode } from "react";
import { SCAN_HREF } from "@/lib/nav-path";
import { requestScan } from "@/lib/scan-request";

/** Skanuj z treści tablicy: otwiera skaner na miejscu, jak Skanuj z nawigacji, także bez zasięgu. */
export function ScanLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a
      href={SCAN_HREF}
      className={className}
      onClick={(event) => {
        if (requestScan()) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
