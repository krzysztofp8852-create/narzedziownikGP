/** Wypisuje jako JSON subskrypcje push osoby (e-mail w argumencie): rodzaj i token aplikacji albo adres przeglądarki. */
import { registryDeps } from "@/lib/registry-instance";

const email = process.argv[2];
const rows = await registryDeps().db.transaction((sql) =>
  sql<{ kind: string; token: string | null; endpoint: string | null }>(
    `select s.kind, s.token, s.endpoint from app.push_subscriptions s join auth.users u on u.id = s.user_id
     where u.email = $1 order by s.created_at`,
    [email],
  ),
);
console.log(JSON.stringify(rows));
process.exit(0);
