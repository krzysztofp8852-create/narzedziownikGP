"use client";

import { useEffect } from "react";
import { forgetBoard } from "@/lib/offline/service-worker";

/**
 * Na stronie logowania nikt nie jest zalogowany, więc kopia tablicy w telefonie należy do kogoś, czyja sesja się
 * skończyła (także bez wylogowania). Znika, zanim zaloguje się następna osoba.
 */
export function ForgetBoard() {
  useEffect(() => {
    forgetBoard().catch((error: unknown) => console.error(error));
  }, []);
  return null;
}
