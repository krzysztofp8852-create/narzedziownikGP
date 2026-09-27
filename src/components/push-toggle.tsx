"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/dzwonek/actions";
import { t } from "@/i18n/t";
import { currentSubscription, pushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";
import type { PushSubscriptionData } from "@/registry/registry";

type State = "checking" | "install-on-ios" | "unsupported" | "blocked" | "off" | "on";

/**
 * Włączanie i wyłączanie powiadomień push w tej przeglądarce. Na iPhonie w Safari podpowiada, jak dodać
 * aplikację do ekranu początkowego, bo tylko tam push działa.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async (): Promise<State> => {
      const support = pushSupport();
      if (support !== "supported") return support;
      if (Notification.permission === "denied") return "blocked";
      if (Notification.permission !== "granted" || !(await currentSubscription())) return "off";
      // Przypisuje tę przeglądarkę osobie, która jest teraz zalogowana, odnawia subskrypcję usuniętą na serwerze
      // i po wymianie kluczy VAPID zastępuje subskrypcję nową (zgoda już jest, więc bez pytania).
      const subscription = await subscribeToPush(vapidPublicKey);
      if (!subscription) return "off";
      await savePushSubscription(subscription as PushSubscriptionData);
      return "on";
    })()
      .catch((error: unknown) => {
        console.error(error);
        return "off" as const;
      })
      .then((next) => active && setState(next));
    return () => {
      active = false;
    };
  }, [vapidPublicKey]);

  async function change(enable: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      if (enable) {
        const subscription = await subscribeToPush(vapidPublicKey);
        if (!subscription) return setState(Notification.permission === "denied" ? "blocked" : "off");
        await savePushSubscription(subscription as PushSubscriptionData);
        setState("on");
      } else {
        await unsubscribeFromPush({ server: true });
        setState("off");
      }
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;
  return (
    <section className="company-card push-settings" aria-labelledby="push-title">
      <h2 id="push-title" className="display section-title">
        {t("push.title")}
      </h2>
      {state === "install-on-ios" && (
        <>
          <p>{t("push.iosIntro")}</p>
          <ol className="push-steps">
            <li>{t("push.iosStep1")}</li>
            <li>{t("push.iosStep2")}</li>
            <li>{t("push.iosStep3")}</li>
          </ol>
        </>
      )}
      {state === "unsupported" && <p className="muted">{t("push.unsupported")}</p>}
      {state === "blocked" && <p>{t("push.blocked")}</p>}
      {(state === "off" || state === "on") && (
        <>
          <p className={state === "on" ? undefined : "muted"}>{t(state === "on" ? "push.on" : "push.off")}</p>
          <div className="form-actions">
            <button
              className={state === "on" ? "button button-quiet" : "button"}
              type="button"
              disabled={busy}
              onClick={() => change(state === "off")}
            >
              {busy ? t("push.saving") : t(state === "on" ? "push.disable" : "push.enable")}
            </button>
          </div>
        </>
      )}
      {failed && (
        <p className="form-error" role="alert">
          {t("push.failed")}
        </p>
      )}
    </section>
  );
}
