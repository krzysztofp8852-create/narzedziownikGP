"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Skanuj z nawigacji (`/?skanuj=1`) już otworzył skaner na tablicy: adres wraca na samą tablicę, żeby kolejne Skanuj
 * otworzyło skaner znowu (inaczej prowadziłoby na ten sam adres), a odświeżenie strony go nie otwierało.
 */
export function ForgetScanParam() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/", { scroll: false });
  }, [router]);
  return null;
}
