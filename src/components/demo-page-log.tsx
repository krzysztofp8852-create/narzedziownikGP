"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordDemoPage } from "@/app/demo/actions";

/**
 * W firmie demo każdy otwarty ekran trafia do dziennika demo super-admina. Niczego nie pokazuje. Ten sam ekran zapisuje
 * raz, także gdy React uruchamia efekt drugi raz (tryb deweloperski); układ montuje go od nowa po przełączeniu roli.
 */
export function DemoPageLog() {
  const pathname = usePathname();
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (recorded.current === pathname) return;
    recorded.current = pathname;
    recordDemoPage(pathname).catch(() => {});
  }, [pathname]);
  return null;
}
