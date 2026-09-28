"use client";

import { usePathname } from "next/navigation";

/** Ukryte pole z bieżącą ścieżką strony: układ aplikacji jej nie zna, a akcja formularza wie, dokąd wrócić. */
export function CurrentPathInput({ name }: { name: string }) {
  return <input type="hidden" name={name} value={usePathname()} />;
}
