import * as changeLog from "./change-log";
import { RegistryError } from "./errors";
import type { Sql } from "./ports";
import type { Role } from "./registry";
import { UUID_PATTERN } from "./validation";

/** Nazwa zastępcza `number`-tej zanonimizowanej osoby w firmie; zastępuje imię i nazwisko w historii. */
export function placeholderName(number: number) {
  return `Osoba zanonimizowana ${number}`;
}

/** Osoba firmy w panelu super-admina: tyle, ile trzeba, żeby rozpoznać, kogo dotyczy prośba. */
export interface CompanyPerson {
  personId: string;
  fullName: string;
  active: boolean;
  anonymized: boolean;
  /** Rola konta; null, gdy osoba nie ma konta. */
  role: Role | null;
  /** E-mail albo nazwa użytkownika konta; null bez konta (i po anonimizacji). */
  login: string | null;
}

/** Wynik anonimizacji w bazie: konto logowania i pliki do usunięcia po zatwierdzeniu transakcji. */
export interface AnonymizedPerson {
  fullName: string;
  userId: string | null;
  documentKeys: string[];
  chatPhotoKeys: string[];
}

/** Osoby firmy `companyId` według imienia i nazwiska. Widzi je tylko super-admin (RLS). */
export async function companyPeople(sql: Sql, companyId: string): Promise<CompanyPerson[]> {
  if (!UUID_PATTERN.test(companyId)) return [];
  return sql<CompanyPerson>(
    `select p.id as "personId", p.full_name as "fullName", p.active, p.anonymized_at is not null as anonymized, u.role,
            coalesce(u.username, u.email) as login
     from app.people p left join app.users u on u.user_id = p.user_id
     where p.company_id = $1
     order by p.full_name, p.created_at`,
    [companyId],
  );
}

/**
 * Anonimizacja osoby `personId` z firmy `companyId` na jej prośbę, przez właściciela tej firmy albo super-admina
 * (`actor`, ADR 0045). Osoba dostaje nazwę zastępczą i staje się nieaktywna; jej notatka, uprawnienia
 * z dokumentami, e-mail i login, subskrypcje push, dzwonek i czat z supportem znikają, a w dzienniku zmian i w dzwonku
 * innych osób jej imię i nazwisko zastępuje nazwa zastępcza. Ruchy, zgłoszenia i odbicia zostają przy jej koncie
 * i osobie, więc pokazują nazwę zastępczą. Konta właściciela, osoby już zanonimizowanej i firmy demo nie anonimizuje.
 *
 * Transakcja systemowa (jak usunięcie firmy), bo zmienia też cudze wiersze, do których nikt nie ma prawa: rolę aktora
 * sprawdza sama, w tej samej transakcji. JWT aktora ustawia tylko po to, żeby wyzwalacz dziennika zmian zapisał go
 * jako autora; bez roli `authenticated` RLS tej transakcji nie ogranicza.
 */
export async function anonymizePerson(
  sql: Sql,
  input: { companyId: string; personId: string; actor: { kind: "wlasciciel" | "super_admin"; userId: string } },
  now: Date,
): Promise<AnonymizedPerson> {
  const { companyId, personId, actor } = input;
  const valid = (id: string) => (UUID_PATTERN.test(id) ? id : null);
  const [allowed] = await sql(
    actor.kind === "super_admin"
      ? "select 1 from app.super_admins where user_id = $1"
      : "select 1 from app.users where user_id = $1 and company_id = $2 and role = 'wlasciciel' and active",
    actor.kind === "super_admin" ? [valid(actor.userId)] : [valid(actor.userId), valid(companyId)],
  );
  if (!allowed) throw new RegistryError("forbidden");
  // Blokada firmy: anonimizacje w jednej firmie idą po kolei, więc nie dostaną tego samego numeru. `no key update`
  // nie wstrzymuje nowych wierszy firmy.
  const [company] = valid(companyId)
    ? await sql<{ demo: boolean }>("select demo_since is not null as demo from app.companies where id = $1 for no key update", [companyId])
    : [];
  if (!company) throw new RegistryError("not_found");
  // Konto roli demo dzielą wszyscy oglądający.
  if (company.demo) throw new RegistryError("demo_locked");
  const [person] = valid(personId)
    ? await sql<{ full_name: string; anonymized: boolean; user_id: string | null; role: Role | null }>(
        `select p.full_name, p.anonymized_at is not null as anonymized, p.user_id, u.role
         from app.people p left join app.users u on u.user_id = p.user_id
         where p.id = $1 and p.company_id = $2
         for update of p`,
        [personId, companyId],
      )
    : [];
  if (!person) throw new RegistryError("not_found");
  if (person.anonymized || person.role === "wlasciciel") throw new RegistryError("forbidden");

  const [{ count }] = await sql<{ count: number }>("select count(*)::int as count from app.people where company_id = $1 and anonymized_at is not null", [
    companyId,
  ]);
  const fullName = placeholderName(count + 1);
  await sql("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.userId })]);
  const keys = async (query: string, id: string) => (await sql<{ key: string }>(query, [id])).map((row) => row.key);
  const documentKeys = await keys(
    `select d.file_path as key from app.qualification_documents d join app.qualifications q on q.id = d.qualification_id
     where q.person_id = $1`,
    personId,
  );
  let chatPhotoKeys: string[] = [];
  const userId = person.user_id;
  if (userId !== null) {
    chatPhotoKeys = await keys("select photo_path as key from app.support_messages where thread_id = $1 and photo_path is not null", userId);
    // Konto najpierw: osoba z kontem jest nieaktywna razem z nim.
    await sql("update app.users set active = false, email = null, username = null, anonymized_at = $2 where user_id = $1", [userId, now]);
    for (const query of [
      "delete from app.push_subscriptions where user_id = $1",
      "delete from app.session_activity where user_id = $1",
      "delete from app.notifications where recipient_id = $1",
      "delete from app.issue_entries where recipient_id = $1",
      "delete from app.support_messages where thread_id = $1",
      "delete from app.support_threads where user_id = $1",
    ]) {
      await sql(query, [userId]);
    }
  }
  // Nowe imię i nazwisko osoby przechodzi też na jej konto (wyzwalacz), a uprawnienia zabierają dokumenty.
  await sql("update app.people set full_name = $2, note = null, active = false, anonymized_at = $3 where id = $1", [personId, fullName, now]);
  await sql("delete from app.qualifications where person_id = $1", [personId]);
  await sql("update app.change_log set person_name = $2, login = null where person_id = $1", [personId, fullName]);
  if (userId !== null) await sql("update app.change_log set actor_name = $2 where actor_id = $1", [userId, fullName]);
  // Imię i nazwisko jako cała wartość w treści wpisów dzwonka (np. kto zabrał sprzęt), nie fragment dłuższego tekstu.
  await sql(
    `update app.notifications set content = replace(content::text, to_jsonb($2::text)::text, to_jsonb($3::text)::text)::jsonb
     where company_id = $1 and strpos(content::text, to_jsonb($2::text)::text) > 0`,
    [companyId, person.full_name, fullName],
  );
  await changeLog.recordChange(sql, companyId, { kind: "osoba_zanonimizowana", personId, personName: fullName }, now);
  return { fullName, userId, documentKeys, chatPhotoKeys };
}
