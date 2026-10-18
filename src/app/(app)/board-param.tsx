"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Skanuj z nawigacji (`/?skanuj=1`) już otworzył skaner na tablicy (albo odnośnik `?operacja=` operację): adres wraca na
 * samą tablicę, żeby kolejny taki odnośnik otworzył ją znowu (inaczej prowadziłby na ten sam adres), a odświeżenie
 * strony jej nie otwierało.
 */
export function ForgetBoardParam() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/", { scroll: false });
  }, [router]);
  return null;
}
