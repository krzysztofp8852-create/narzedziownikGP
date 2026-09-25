import { createPgDb } from "@/registry/pg-db";
import { systemClock } from "@/registry/ports";
import { createRegistry, type Registry } from "@/registry/registry";
import { createSupabaseAuthAdmin } from "@/registry/supabase-auth-admin";
import { publicEnv, serverEnv } from "./env";

let registry: Registry | undefined;

/** Rejestr na prawdziwej bazie i Supabase Auth. Wspólny dla aplikacji i skryptów. */
export function getRegistry(): Registry {
  registry ??= createRegistry({
    db: createPgDb({ connectionString: serverEnv.databaseUrl(), ssl: sslFor(serverEnv.databaseUrl()), max: 3 }),
    clock: systemClock,
    authAdmin: createSupabaseAuthAdmin(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey()),
  });
  return registry;
}

/**
 * Poza lokalnym Supabase połączenie jest szyfrowane. Certyfikat Supabase nie
 * pochodzi z publicznego CA, więc bez dołączonego CA go nie weryfikujemy.
 */
function sslFor(connectionString: string) {
  const { hostname } = new URL(connectionString);
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) ? false : { rejectUnauthorized: false };
}
