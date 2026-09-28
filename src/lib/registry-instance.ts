import { createPgDb } from "@/registry/pg-db";
import { type Notifier, systemClock } from "@/registry/ports";
import { createRegistry, type Registry, type RegistryDeps } from "@/registry/registry";
import { createSupabaseAuthAdmin } from "@/registry/supabase-auth-admin";
import { CHAT_PHOTOS_BUCKET, createSupabasePhotoStore, ISSUE_PHOTOS_BUCKET } from "@/registry/supabase-photo-store";
import { createResendNotifier, logNotifier } from "./email-notifier";
import { publicEnv, serverEnv } from "./env";
import { createWebPushChannel, logPush } from "./web-push-notifier";
import { SUPABASE_ROOT_CA } from "./supabase-root-ca";

let registry: Registry | undefined;

/** Rejestr na prawdziwej bazie, Supabase Auth i Storage (zdjęcia zgłoszeń i czatu) i powiadomieniach e-mail i push. Wspólny dla aplikacji i skryptów. */
export function getRegistry(): Registry {
  registry ??= createRegistry(registryDeps());
  return registry;
}

/** Zależności Rejestru aplikacji; skrypt demo bierze z nich bazę, Auth i Storage, a zegar i powiadomienia ma własne. */
export function registryDeps(): RegistryDeps {
  return {
    db: createPgDb({ connectionString: serverEnv.databaseUrl(), ssl: sslFor(serverEnv.databaseUrl()), max: 3 }),
    clock: systemClock,
    authAdmin: createSupabaseAuthAdmin(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey()),
    notifier: notifier(),
    photos: createSupabasePhotoStore(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), ISSUE_PHOTOS_BUCKET),
    chatPhotos: createSupabasePhotoStore(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), CHAT_PHOTOS_BUCKET),
  };
}

function notifier(): Notifier {
  const resend = serverEnv.resend();
  const webPush = serverEnv.webPush();
  const email = resend ? createResendNotifier({ ...resend, appUrl: serverEnv.appUrl(), supportAddress: serverEnv.supportEmail() }) : logNotifier;
  return { send: email.send, sendToSupport: email.sendToSupport, push: webPush ? createWebPushChannel(webPush) : logPush };
}

/** Poza lokalnym Supabase połączenie jest szyfrowane, a certyfikat serwera sprawdzany względem CA Supabase. */
function sslFor(connectionString: string) {
  const { hostname } = new URL(connectionString);
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) ? false : { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
}
