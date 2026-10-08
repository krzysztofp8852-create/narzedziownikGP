"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/dzwonek/actions";
import { t } from "@/i18n/t";
import { appPushState, disableAppPush, enableAppPush, hasAppPush } from "@/lib/push/app";
import { currentSubscription, pushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";

type State = "checking" | "hidden" | "install-on-ios" | "unsupported" | "blocked" | "off" | "on";

/**
 * Włączanie i wyłączanie powiadomień push na tym telefonie. W aplikacji na Androida przez FCM (Android pyta o zgodę
 * dopiero przy włączeniu), w przeglądarce przez Web Push kluczem VAPID serwera; bez klucza w przeglądarce nie ma czego
 * włączać. Na iPhonie w Safari podpowiada, jak dodać program do ekranu początkowego (PWA), bo tylko tam push działa.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async (): Promise<State> => {
      if (hasAppPush()) return appPushState();
      if (!vapidPublicKey) return "hidden";
      const support = pushSupport();
      if (support !== "supported") return support;
      if (Notification.permission === "denied") return "blocked";
      if (Notification.permission !== "granted" || !(await currentSubscription())) return "off";
      // Przypisuje tę przeglądarkę osobie, która jest teraz zalogowana, odnawia subskrypcję usuniętą na serwerze
      // i po wymianie kluczy VAPID zastępuje subskrypcję nową (zgoda już jest, więc bez pytania).
      const subscription = await subscribeToPush(vapidPublicKey);
      if (!subscription) return "off";
      await savePushSubscription(browserSubscription(subscription));
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
      if (hasAppPush()) {
        if (enable) setState(await enableAppPush());
        else {
          await disableAppPush({ server: true });
          setState("off");
        }
      } else if (enable && vapidPublicKey) {
        const subscription = await subscribeToPush(vapidPublicKey);
        if (!subscription) return setState(Notification.permission === "denied" ? "blocked" : "off");
        await savePushSubscription(browserSubscription(subscription));
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

  if (state === "checking" || state === "hidden") return null;
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

/** Subskrypcja przeglądarki do zapisania na serwerze. */
function browserSubscription(subscription: PushSubscriptionJSON) {
  return { kind: "przegladarka" as const, ...(subscription as { endpoint: string; keys: { p256dh: string; auth: string } }) };
}
