import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import { subscriptionStatus } from "./subscriptions";
import { UUID_PATTERN } from "./validation";

/** Pliki i konta logowania usuniętej firmy: znikają z kubełków i z Supabase Auth po zatwierdzeniu transakcji. */
export interface PurgedCompany {
  userIds: string[];
  photoKeys: string[];
  chatPhotoKeys: string[];
  documentKeys: string[];
}

/**
 * Tabele firmy w kolejności usuwania: wiersz znika, zanim zniknie to, na co wskazuje. Testy usuwania sprawdzają, że
 * po nim w żadnej tabeli `app` nie zostaje nic z firmy, więc nowa tabela z `company_id` musi tu trafić.
 */
const COMPANY_TABLES = [
  "daily_rates",
  "deadline_alerts",
  "tool_deadline_documents",
  "tool_deadlines",
  "qualification_alerts",
  "qualification_documents",
  "qualifications",
  "qualification_kinds",
  "punches",
  "threshold_alerts",
  "notifications",
  "issue_entries",
  "issue_comments",
  "issues",
  "rejected_movements",
  "movement_tools",
  "movements",
  "company_reports",
  "push_subscriptions",
  "support_messages",
  "support_threads",
  "rental_rates",
  "tool_value_history",
  "tool_values",
  "tools",
  "tool_imports",
  "categories",
  "locations",
  "subscriptions",
  "people",
  "users",
] as const;

/**
 * Usuwa wszystkie wiersze firmy, także historię ruchów, wątki zgłoszeń i czat. Baza pozwala na to tylko firmie
 * usuwanej w całości (`app.is_purged_company`). Transakcja systemowa. Zwraca pliki i konta do usunięcia potem.
 */
export async function purgeCompany(sql: Sql, companyId: string): Promise<PurgedCompany> {
  const keys = async (query: string) => (await sql<{ key: string }>(query, [companyId])).map((row) => row.key);
  const purged: PurgedCompany = {
    userIds: await keys("select user_id as key from app.users where company_id = $1"),
    photoKeys: await keys("select photo_path as key from app.issues where company_id = $1 and photo_path is not null"),
    chatPhotoKeys: await keys(
      `select m.photo_path as key from app.support_messages m join app.support_threads t on t.user_id = m.thread_id
       where t.company_id = $1 and m.photo_path is not null`,
    ),
    documentKeys: await keys(
      `select file_path as key from app.tool_deadline_documents where company_id = $1
       union all select file_path from app.qualification_documents where company_id = $1`,
    ),
  };
  for (const table of COMPANY_TABLES) {
    if (table === "support_messages") {
      await sql("delete from app.support_messages where thread_id in (select user_id from app.support_threads where company_id = $1)", [companyId]);
    } else {
      await sql(`delete from app.${table} where company_id = $1`, [companyId]);
    }
  }
  await sql("delete from app.companies where id = $1", [companyId]);
  return purged;
}

/**
 * Czy wpisana nazwa potwierdza usunięcie tej firmy: zgadza się co do znaku, bez spacji na brzegach. Tę samą regułę
 * sprawdza formularz (przycisk) i Rejestr.
 */
export function confirmsCompanyName(confirmation: string, companyName: string) {
  return confirmation.trim() === companyName.trim();
}

/**
 * Usunięcie firmy przez super-admina `deletedBy`, na polecenie klienta (ADR 0025). Firma musi być w trybie tylko do
 * odczytu, `confirmation` to jej nazwa wpisana na potwierdzenie, a firmy demo nie usuwa się w ten sposób. Wpis
 * w dzienniku usuniętych firm powstaje przed usunięciem wierszy i to on odblokowuje usunięcie historii.
 * Transakcja systemowa, więc rolę super-admina sprawdza tu sama, w tej samej transakcji co usunięcie.
 */
export async function deleteCompany(
  sql: Sql,
  input: { companyId: string; confirmation: string; deletedBy: string },
  now: Date,
): Promise<PurgedCompany> {
  const [admin] = await sql<{ super_admin: boolean }>(
    "select exists (select 1 from app.super_admins where user_id = $1::uuid) as super_admin",
    [UUID_PATTERN.test(input.deletedBy) ? input.deletedBy : null],
  );
  if (!admin.super_admin) throw new RegistryError("forbidden");
  if (!UUID_PATTERN.test(input.companyId)) throw new RegistryError("not_found");
  // Blokada wierszy firmy i abonamentu: równoległa zmiana abonamentu, drugie usunięcie i każdy nowy wiersz firmy
  // (klucz obcy do firmy) czekają na tę transakcję.
  const [company] = await sql<{
    name: string;
    demo: boolean;
    paid_until: string | null;
    manual_read_only: boolean;
  }>(
    `select c.name, c.demo_since is not null as demo, to_char(s.paid_until, 'YYYY-MM-DD') as paid_until, s.manual_read_only
     from app.companies c join app.subscriptions s on s.company_id = c.id
     where c.id = $1
     for update of c, s`,
    [input.companyId],
  );
  if (!company) throw new RegistryError("not_found");
  if (company.demo) throw new RegistryError("demo_delete");
  if (subscriptionStatus({ paidUntil: company.paid_until, manualReadOnly: company.manual_read_only }, now) !== "tylko_do_odczytu") {
    throw new RegistryError("delete_requires_read_only");
  }
  if (!confirmsCompanyName(input.confirmation, company.name)) throw new RegistryError("delete_confirmation");
  // Czat działa też w trybie tylko do odczytu, a wiadomość wskazuje wątek, nie firmę. Blokada wątków sprawia, że
  // wiadomość wysyłana w tej chwili albo zapisze się przed usunięciem (i zniknie z resztą), albo odpadnie po nim.
  await sql("select user_id from app.support_threads where company_id = $1 for update", [input.companyId]);
  await sql("insert into app.company_deletions (company_id, name, deleted_at, deleted_by) values ($1, $2, $3, $4)", [
    input.companyId,
    company.name,
    now,
    input.deletedBy,
  ]);
  return purgeCompany(sql, input.companyId);
}
