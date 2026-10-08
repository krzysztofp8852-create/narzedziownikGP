"use client";

import { useEffect } from "react";
import { forgetBoard } from "@/lib/offline/service-worker";
import { disableAppPush } from "@/lib/push/app";
import { unsubscribeFromPush } from "@/lib/push/client";

/**
 * Na stronie logowania nikt nie jest zalogowany, więc kopia tablicy w telefonie i subskrypcja push należą do kogoś,
 * czyja sesja się skończyła (także bez wylogowania). Znikają, zanim zaloguje się następna osoba; wyłączona
 * w przeglądarce subskrypcja (albo unieważniony token aplikacji) wygasa też na serwerze przy najbliższej wysyłce.
 */
export function ForgetBoard() {
  useEffect(() => {
    forgetBoard().catch((error: unknown) => console.error(error));
    unsubscribeFromPush({ server: false }).catch((error: unknown) => console.error(error));
    disableAppPush({ server: false }).catch((error: unknown) => console.error(error));
  }, []);
  return null;
}
