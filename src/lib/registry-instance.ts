import { createPgDb } from "@/registry/pg-db";
import { systemClock } from "@/registry/ports";
import { createRegistry, type Registry } from "@/registry/registry";
import { createSupabaseAuthAdmin } from "@/registry/supabase-auth-admin";
import { createSupabasePhotoStore } from "@/registry/supabase-photo-store";
import { publicEnv, serverEnv } from "./env";
import { SUPABASE_ROOT_CA } from "./supabase-root-ca";

let registry: Registry | undefined;

/** Rejestr na prawdziwej bazie, Supabase Auth i Supabase Storage. Wspólny dla aplikacji i skryptów. */
export function getRegistry(): Registry {
  registry ??= createRegistry({
    db: createPgDb({ connectionString: serverEnv.databaseUrl(), ssl: sslFor(serverEnv.databaseUrl()), max: 3 }),
    clock: systemClock,
    authAdmin: createSupabaseAuthAdmin(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey()),
    photos: createSupabasePhotoStore(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey()),
  });
  return registry;
}

/** Poza lokalnym Supabase połączenie jest szyfrowane, a certyfikat serwera sprawdzany względem CA Supabase. */
function sslFor(connectionString: string) {
  const { hostname } = new URL(connectionString);
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) ? false : { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
}
