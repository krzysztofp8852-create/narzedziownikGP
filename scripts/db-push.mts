/** Wgrywa migracje z supabase/migrations do bazy z DATABASE_URL (np. projektu testowego w chmurze). */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Brak DATABASE_URL (zob. README).");
  process.exit(1);
}
const { status } = spawnSync("npx", ["supabase", "db", "push", "--db-url", url, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(status ?? 1);
