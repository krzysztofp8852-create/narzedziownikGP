import { csv } from "@/export/csv";
import { RegistryError } from "./errors";
import type { PhotoStore, Sql } from "./ports";
import { UUID_PATTERN } from "./validation";

/**
 * Pełny eksport danych firmy na jej żądanie (umowa § 6 ust. 2, zmiana dostawcy): każda tabela `app` z danymi firmy
 * jako CSV (`dane/<tabela>.csv`), pliki z magazynów w oryginalnym formacie (`pliki/<folder>/<id wiersza>.<rozszerzenie>`)
 * i `README.md` z opisem struktury. Pliki trafiają po kolei do `add` (skrypt pakuje je do ZIP-u).
 */
export type ExportSink = (path: string, content: Uint8Array) => Promise<void>;

export interface CompanyExportSummary {
  companyName: string;
  /** Ile plików CSV (tabel). */
  tables: number;
  /** Ile plików z magazynów trafiło do eksportu. */
  files: number;
  /** Ścieżki plików, które wskazuje wiersz, a których nie było w magazynie. */
  missingFiles: string[];
}

/** Kubełki z plikami firmy, jak w Rejestrze. */
export interface ExportStores {
  photos: PhotoStore;
  chatPhotos: PhotoStore;
  documents: PhotoStore;
}

/** Tabela w eksporcie: znaczenie każdej kolumny do README i kolumny celowo pominięte (z powodem). */
export interface ExportTable {
  table: string;
  title: string;
  description: string;
  columns: Record<string, string>;
  omitted?: Record<string, string>;
}

const COMPANY_ID = "Firma (w eksporcie zawsze ta sama, zob. `companies.id`).";
const OPERATION_ID = "Identyfikator operacji nadany przez urządzenie; chroni przed podwójnym zapisem tej samej czynności.";
const SEQUENCE = "Kolejność zapisu w bazie (rośnie z każdym wpisem).";
const PUNCH_RESULT = "Wynik sprawdzenia położenia telefonu: na_budowie, poza_budowa, brak_polozenia albo bez_sprawdzenia.";
const CONTENT_TYPE = "Typ pliku: image/jpeg, image/png, image/webp albo application/pdf.";

/**
 * Tabele eksportu w kolejności z README. Testy eksportu sprawdzają, że jest tu każda tabela `app` z `company_id`
 * (poza dziennikami demo i usuniętych firm, które nie są danymi firmy) i każda jej kolumna: opisana albo pominięta.
 */
export const EXPORT_TABLES: ExportTable[] = [
  {
    table: "companies",
    title: "Firma",
    description: "Jeden wiersz: firma i jej ustawienia.",
    columns: {
      id: "Identyfikator firmy.",
      name: "Nazwa firmy.",
      alarm_threshold_days: "Próg dni firmy: po tylu dniach na budowie narzędzie wywołuje alarm.",
      created_at: "Kiedy firmę założono.",
      issues_site_managers: "Czy kierownicy widzą zgłoszenia ze swoich budów i pojazdów.",
      issues_storekeepers: "Czy magazynierzy widzą zgłoszenia.",
      issues_storekeepers_close: "Czy magazynierzy mogą zamykać zgłoszenia.",
      demo_since: "Od kiedy firma jest firmą demo; puste u każdej innej.",
      site_managers_see_costs: "Czy kierownicy widzą koszt sprzętu swoich budów i pojazdów.",
    },
  },
  {
    table: "subscriptions",
    title: "Abonament",
    description: "Jeden wiersz: pakiet, opłacony okres i dane do faktury.",
    columns: {
      company_id: COMPANY_ID,
      tier: "Pakiet: maly, sredni albo duzy.",
      paid_until: "Ostatni opłacony dzień; puste przed pierwszą wpłatą.",
      manual_read_only: "Czy tryb tylko do odczytu włączono ręcznie.",
      invoice_name: "Nazwa nabywcy na fakturze.",
      tax_id: "NIP nabywcy (10 cyfr).",
      invoice_address: "Adres nabywcy na fakturze.",
      implementation_tier: "Pakiet, którego wdrożenie opłacono.",
    },
  },
  {
    table: "users",
    title: "Konta",
    description: "Konta logowania w firmie. Haseł i sesji eksport nie zawiera.",
    columns: {
      user_id: "Identyfikator konta.",
      company_id: COMPANY_ID,
      role: "Rola konta.",
      full_name: "Imię i nazwisko.",
      email: "E-mail do logowania; pracownik może go nie mieć.",
      must_change_password: "Czy konto ma jeszcze hasło tymczasowe do zmiany.",
      active: "Czy konto jest aktywne (dezaktywowane się nie loguje).",
      created_at: "Kiedy konto założono.",
      temporary_password_issued_at: "Kiedy nadano ostatnie hasło tymczasowe.",
      username: "Nazwa użytkownika pracownika do logowania.",
      tutorial: "Samouczek: ukonczony, pominiety albo puste (nie zakończony).",
    },
  },
  {
    table: "people",
    title: "Ludzie",
    description: "Kartoteka osób firmy, z kontem i bez konta.",
    columns: {
      id: "Identyfikator osoby.",
      company_id: COMPANY_ID,
      full_name: "Imię i nazwisko.",
      note: "Notatka.",
      active: "Czy osoba jest aktywna (nieaktywna odeszła z firmy).",
      user_id: "Konto osoby; puste, gdy osoba nie ma konta.",
      created_at: "Kiedy osobę dodano.",
    },
  },
  {
    table: "locations",
    title: "Lokalizacje",
    description: "Baza, budowy, serwisy i pojazdy.",
    columns: {
      id: "Identyfikator lokalizacji.",
      company_id: COMPANY_ID,
      kind: "Rodzaj lokalizacji.",
      name: "Nazwa.",
      created_at: "Kiedy lokalizację dodano.",
      address: "Adres (budowa, baza).",
      manager_id: "Kierownik budowy albo pojazdu.",
      status: "Status budowy.",
      finished_at: "Kiedy budowę zakończono.",
      finished_by: "Kto zakończył budowę.",
      active: "Czy pojazd jest aktywny.",
      alarm_enabled: "Czy na pojeździe działa alarm progu dni.",
      latitude: "Położenie na mapie budów: szerokość geograficzna (stopnie, WGS 84).",
      longitude: "Położenie na mapie budów: długość geograficzna (stopnie, WGS 84).",
      poster_token: "Kod plakatu budowy do odbijania (na plakacie, do wpisania ręcznie).",
      punch_radius_m: "Promień odbicia w metrach.",
      registration_number: "Numer rejestracyjny pojazdu.",
      vin: "VIN pojazdu.",
    },
  },
  {
    table: "categories",
    title: "Kategorie narzędzi",
    description: "Kategorie z prefiksem kodu narzędzi.",
    columns: {
      id: "Identyfikator kategorii.",
      company_id: COMPANY_ID,
      name: "Nazwa kategorii.",
      prefix: "Prefiks kodów narzędzi tej kategorii (np. S w S-01).",
      created_at: "Kiedy kategorię dodano.",
    },
  },
  {
    table: "tools",
    title: "Narzędzia",
    description: "Każdy egzemplarz sprzętu, z obecną lokalizacją i stanem.",
    columns: {
      id: "Identyfikator narzędzia.",
      company_id: COMPANY_ID,
      code: "Kod narzędzia z naklejki QR (np. S-01).",
      name: "Nazwa.",
      category_id: "Kategoria.",
      brand: "Marka.",
      model: "Model.",
      serial_number: "Numer seryjny.",
      state: "Stan narzędzia.",
      registration: "Status ewidencji: zgloszone (czeka na akceptację właściciela) albo zaakceptowane.",
      location_id: "Gdzie narzędzie jest teraz.",
      located_since: "Od kiedy jest w tej lokalizacji.",
      created_at: "Kiedy narzędzie dodano.",
      sticker_printed_at: "Kiedy ostatnio drukowano jego naklejkę QR.",
      damaged_since: "Od kiedy narzędzie ma flagę „uszkodzone”; puste, gdy jej nie ma.",
      rented_from: "Wypożyczalnia; wypełnione tylko przy sprzęcie wynajętym.",
    },
  },
  {
    table: "tool_values",
    title: "Wartości narzędzi",
    description: "Obecna wartość narzędzia.",
    columns: { tool_id: "Narzędzie.", company_id: COMPANY_ID, value: "Wartość w zł." },
  },
  {
    table: "tool_value_history",
    title: "Historia wartości narzędzi",
    description: "Każda zmiana wartości narzędzia, od dnia, w którym obowiązuje.",
    columns: {
      tool_id: "Narzędzie.",
      company_id: COMPANY_ID,
      value: "Wartość w zł od tego dnia; puste: od tego dnia bez wartości.",
      valid_from: "Dzień, od którego wartość obowiązuje.",
      recorded_at: "Kiedy ją zapisano.",
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "daily_rates",
    title: "Stawki dzienne",
    description: "Stawki dzienne do kosztu sprzętu: firmy, kategorii i narzędzia, każda od dnia ustawienia.",
    columns: {
      id: "Identyfikator wpisu.",
      company_id: COMPANY_ID,
      kind: "Czego dotyczy stawka: firma, kategoria albo narzedzie.",
      category_id: "Kategoria (stawka kategorii).",
      tool_id: "Narzędzie (stawka narzędzia).",
      percent: "Procent wartości narzędzia na dzień (firma, kategoria).",
      amount: "Kwota w zł za dzień (narzędzie). Puste procent i kwota przy kategorii albo narzędziu: zdjęcie stawki.",
      valid_from: "Dzień, od którego stawka obowiązuje.",
      recorded_at: "Kiedy ją zapisano.",
      recorded_by: "Kto ją ustawił.",
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "rental_rates",
    title: "Stawki wypożyczalni",
    description: "Stawka dobowa sprzętu wynajętego z umowy z wypożyczalnią.",
    columns: { tool_id: "Narzędzie wynajęte.", company_id: COMPANY_ID, amount: "Stawka w zł za dobę.", recorded_at: "Kiedy ją zapisano." },
  },
  {
    table: "tool_imports",
    title: "Importy narzędzi",
    description: "Importy narzędzi z pliku Excel.",
    columns: {
      id: "Identyfikator importu.",
      company_id: COMPANY_ID,
      client_operation_id: OPERATION_ID,
      author_id: "Kto importował.",
      tool_count: "Ile narzędzi przyjęto.",
      created_at: "Kiedy.",
    },
  },
  {
    table: "movements",
    title: "Ruchy",
    description: "Historia ruchów narzędzi (tylko się dopisuje). Które narzędzia objął ruch: `movement_tools`.",
    columns: {
      id: "Identyfikator ruchu.",
      company_id: COMPANY_ID,
      kind: "Rodzaj ruchu (przyjecie, wydanie, zwrot, przeniesienie, do_serwisu, z_serwisu, korekta, zaginiecie, wycofanie, zwrot_do_wypozyczalni, cofniecie).",
      source: "Jak zapisano ruch: panel, checklista, import, qr (skan naklejki) albo glos (nagranie lub tekst).",
      from_location_id: "Skąd.",
      to_location_id: "Dokąd.",
      author_id: "Kto zapisał ruch.",
      occurred_at: "Kiedy ruch nastąpił.",
      recorded_at: "Kiedy go zapisano (później niż `occurred_at` przy zapisie z kolejki offline).",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
      reason: "Powód (korekta, zaginięcie).",
      from_state: "Stan narzędzi przed ruchem (zmiana stanu).",
      to_state: "Stan narzędzi po ruchu (zmiana stanu).",
      reverses_movement_id: "Ruch odwrócony przez to cofnięcie.",
      responsible_user_id: "Kto odpowiadał za narzędzie, które zaginęło (kierownik budowy).",
      transcript: "Tekst nagrania albo wpisu, z którego powstał ruch.",
    },
  },
  {
    table: "movement_tools",
    title: "Narzędzia w ruchach",
    description: "Które narzędzia objął każdy ruch (wiersz na parę ruch i narzędzie).",
    columns: {
      movement_id: "Ruch.",
      tool_id: "Narzędzie.",
      company_id: COMPANY_ID,
      damaged_since_before: "Flaga „uszkodzone” narzędzia sprzed ruchu z serwisu, który ją zdjął (wraca przy cofnięciu).",
    },
  },
  {
    table: "rejected_movements",
    title: "Odrzucone ruchy",
    description: "Ruchy z kolejki offline, których nie zapisano (np. sprzęt był już gdzie indziej).",
    columns: {
      id: "Identyfikator wpisu.",
      company_id: COMPANY_ID,
      author_id: "Kto próbował zapisać ruch.",
      client_operation_id: OPERATION_ID,
      kind: "Rodzaj ruchu.",
      source: "Jak zapisano ruch.",
      from_location_id: "Skąd.",
      to_location_id: "Dokąd.",
      tool_ids: "Narzędzia (identyfikatory z `tools.id`).",
      occurred_at: "Kiedy ruch miał nastąpić.",
      rejected_at: "Kiedy go odrzucono.",
      reason: "Kod przyczyny odrzucenia.",
      conflicts: "Szczegóły konfliktu: gdzie były narzędzia i kto je przeniósł.",
      resolved_at: "Kiedy autor zamknął sprawę na liście do wyjaśnienia.",
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "threshold_alerts",
    title: "Alarmy progu dni",
    description: "Pobyty narzędzi na budowie, przy których przekroczono próg dni i wysłano alarm.",
    columns: {
      tool_id: "Narzędzie.",
      company_id: COMPANY_ID,
      located_since: "Początek pobytu (jak `tools.located_since`), którego dotyczył alarm.",
      detected_at: "Kiedy wykryto przekroczenie.",
    },
  },
  {
    table: "company_reports",
    title: "Wysłane raporty",
    description: "Raporty tygodniowe i piątkowe wysłane firmie.",
    columns: {
      company_id: COMPANY_ID,
      kind: "Raport: tygodniowy albo piatkowy.",
      day: "Dzień raportu.",
      off_base_value: "Łączna wartość sprzętu poza bazą w zł (raport tygodniowy).",
      generated_at: "Kiedy raport przygotowano.",
    },
  },
  {
    table: "notifications",
    title: "Dzwonek",
    description: "Powiadomienia w dzwonku użytkowników.",
    columns: {
      id: "Identyfikator wpisu.",
      company_id: COMPANY_ID,
      recipient_id: "Adresat.",
      kind: "Rodzaj powiadomienia (np. narzedzia_zabrane, prog_przekroczony, raport_tygodniowy, terminy, uprawnienia).",
      content: "Treść wpisu (JSON, zależnie od rodzaju).",
      dedupe_key: "Klucz, który nie pozwala dać temu samemu adresatowi dwa razy tego samego powiadomienia.",
      created_at: "Kiedy powstało.",
      read_at: "Kiedy adresat je przeczytał.",
    },
  },
  {
    table: "issues",
    title: "Zgłoszenia",
    description: "Zgłoszenia uszkodzeń, braków i innych spraw. Zdjęcie: `pliki/zdjecia-zgloszen/<id>.<rozszerzenie>`.",
    columns: {
      id: "Identyfikator zgłoszenia.",
      company_id: COMPANY_ID,
      kind: "Rodzaj: uszkodzenie, brak albo inne.",
      description: "Opis.",
      tool_id: "Narzędzie, którego dotyczy.",
      location_id: "Lokalizacja, której dotyczy.",
      photo_path: "Klucz zdjęcia w magazynie plików; puste, gdy zgłoszenie nie ma zdjęcia.",
      author_id: "Kto zgłosił.",
      status: "Status: otwarte albo zamkniete.",
      created_at: "Kiedy zgłoszono.",
      closed_at: "Kiedy zamknięto.",
      closed_by: "Kto zamknął.",
      tool_working: "Przy zamknięciu uszkodzenia: czy narzędzie uznano za sprawne.",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "issue_comments",
    title: "Komentarze zgłoszeń",
    description: "Wątek komentarzy każdego zgłoszenia.",
    columns: {
      id: "Identyfikator komentarza.",
      company_id: COMPANY_ID,
      issue_id: "Zgłoszenie.",
      author_id: "Autor.",
      body: "Treść.",
      closes: "Czy komentarz zamknął zgłoszenie.",
      created_at: "Kiedy dodano.",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "issue_entries",
    title: "Okno zgłoszeń",
    description: "Wpisy w oknie zgłoszeń użytkowników (nowe zgłoszenie, komentarz, zamknięcie, zgłoszenie narzędzia).",
    columns: {
      id: "Identyfikator wpisu.",
      company_id: COMPANY_ID,
      recipient_id: "Adresat.",
      kind: "Rodzaj: zgloszenie, komentarz, zamkniecie albo zgloszenie_narzedzia.",
      issue_id: "Zgłoszenie.",
      comment_id: "Komentarz.",
      tool_id: "Narzędzie zgłoszone do ewidencji.",
      created_at: "Kiedy powstał.",
      read_at: "Kiedy adresat go przeczytał.",
    },
  },
  {
    table: "tool_deadlines",
    title: "Terminy",
    description: "Terminy narzędzi (przegląd, kalibracja, UDT, gwarancja, zwrot do wypożyczalni) i pojazdów.",
    columns: {
      id: "Identyfikator terminu.",
      company_id: COMPANY_ID,
      tool_id: "Narzędzie (termin narzędzia).",
      kind: "Rodzaj: przeglad, kalibracja, udt, gwarancja, zwrot (narzędzie) albo przeglad_techniczny, oc, ac, tachograf, wlasny (pojazd).",
      due_on: "Termin.",
      cycle_months: "Cykl w miesiącach; następny termin to wykonanie plus cykl.",
      note: "Notatka.",
      last_done_on: "Dzień ostatniego wykonania.",
      last_done_by: "Kto wpisał ostatnie wykonanie.",
      last_done_operation_id: OPERATION_ID,
      created_at: "Kiedy termin dodano.",
      vehicle_id: "Pojazd (termin pojazdu).",
      name: "Nazwa terminu własnego pojazdu.",
    },
  },
  {
    table: "tool_deadline_documents",
    title: "Dokumenty terminów",
    description: "Zdjęcia i PDF-y przy terminach. Plik: `pliki/dokumenty-terminow/<id>.<rozszerzenie>`.",
    columns: {
      id: "Identyfikator dokumentu.",
      company_id: COMPANY_ID,
      deadline_id: "Termin.",
      kind: "Rodzaj: swiadectwo, protokol, karta_gwarancyjna, faktura, polisa, dowod_rejestracyjny albo inne.",
      file_path: "Klucz pliku w magazynie plików.",
      file_name: "Oryginalna nazwa pliku.",
      content_type: CONTENT_TYPE,
      uploaded_by: "Kto dodał.",
      uploaded_at: "Kiedy dodano.",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "deadline_alerts",
    title: "Przypomnienia o terminach",
    description: "Wysłane przypomnienia o terminach, każde raz.",
    columns: {
      deadline_id: "Termin.",
      company_id: COMPANY_ID,
      due_on: "Data terminu, o którym przypomniano.",
      phase: "Kiedy: przed albo po terminie.",
      detected_at: "Kiedy przypomniano.",
    },
  },
  {
    table: "qualification_kinds",
    title: "Własne rodzaje uprawnień",
    description: "Rodzaje uprawnień dodane przez firmę.",
    columns: { id: "Identyfikator rodzaju.", company_id: COMPANY_ID, name: "Nazwa.", created_at: "Kiedy dodano." },
  },
  {
    table: "qualifications",
    title: "Uprawnienia",
    description: "Badania, szkolenia i uprawnienia osób z datą ważności.",
    columns: {
      id: "Identyfikator uprawnienia.",
      company_id: COMPANY_ID,
      person_id: "Osoba.",
      kind: "Rodzaj: badania_lekarskie, szkolenie_bhp, badania_wysokosc, sep, udt, prawo_jazdy, pierwsza_pomoc albo wlasny.",
      custom_kind_id: "Własny rodzaj (gdy `kind` to wlasny).",
      detail: "Szczegół: urządzenie UDT, kategoria prawa jazdy, grupa SEP.",
      due_on: "Ważne do.",
      cycle_months: "Cykl w miesiącach; odnowienie przesuwa datę o cykl.",
      note: "Notatka.",
      last_done_on: "Dzień ostatniego odnowienia.",
      last_done_by: "Kto wpisał ostatnie odnowienie.",
      last_done_operation_id: OPERATION_ID,
      created_at: "Kiedy dodano.",
    },
  },
  {
    table: "qualification_documents",
    title: "Dokumenty uprawnień",
    description: "Zdjęcia i PDF-y przy uprawnieniach. Plik: `pliki/dokumenty-uprawnien/<id>.<rozszerzenie>`.",
    columns: {
      id: "Identyfikator dokumentu.",
      company_id: COMPANY_ID,
      qualification_id: "Uprawnienie.",
      file_path: "Klucz pliku w magazynie plików.",
      file_name: "Oryginalna nazwa pliku.",
      content_type: CONTENT_TYPE,
      uploaded_by: "Kto dodał.",
      uploaded_at: "Kiedy dodano.",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "qualification_alerts",
    title: "Przypomnienia o uprawnieniach",
    description: "Wysłane przypomnienia o końcu ważności uprawnień, każde raz.",
    columns: {
      qualification_id: "Uprawnienie.",
      company_id: COMPANY_ID,
      due_on: "Data ważności, o której przypomniano.",
      phase: "Kiedy: przed albo po końcu ważności.",
      detected_at: "Kiedy przypomniano.",
    },
  },
  {
    table: "punches",
    title: "Odbicia",
    description: "Pobyty osób na budowie albo bazie: wejście i wyjście. Poprawki godzin: `punch_corrections`.",
    columns: {
      id: "Identyfikator odbicia.",
      company_id: COMPANY_ID,
      person_id: "Osoba.",
      location_id: "Budowa albo baza.",
      punched_by: "Kto odbił wejście (osoba sama albo kierownik za nią).",
      entered_at: "Wejście.",
      entry_result: PUNCH_RESULT,
      entry_distance_m: "Odległość od budowy przy wejściu, w metrach.",
      entry_operation_id: OPERATION_ID,
      left_at: "Wyjście; puste, dopóki osoba jest odbita.",
      exit_via: "Jak skończył się pobyt: wyjscie, przejscie (skan na innej budowie), bez_wyjscia (zamknięte o północy) albo uzupelnione (poprawka).",
      exit_result: PUNCH_RESULT,
      exit_distance_m: "Odległość od budowy przy wyjściu, w metrach.",
      exit_operation_id: OPERATION_ID,
      explained_at: "Kiedy odbicie wyjaśniono.",
      explained_by: "Kto wyjaśnił.",
      explanation: "Notatka wyjaśnienia.",
      sequence_number: SEQUENCE,
      entry_offline: "Czy wejście zapisano z kolejki offline.",
      exit_offline: "Czy wyjście zapisano z kolejki offline.",
      exit_punched_by: "Kto odbił wyjście.",
      exit_reminded_at: "Kiedy przypomniano o wyjściu.",
    },
  },
  {
    table: "punch_corrections",
    title: "Poprawki odbić",
    description: "Historia poprawek godzin wejścia i wyjścia.",
    columns: {
      id: "Identyfikator poprawki.",
      company_id: COMPANY_ID,
      punch_id: "Odbicie.",
      field: "Co poprawiono: wejscie albo wyjscie.",
      from_at: "Godzina przed poprawką; puste, gdy wyjścia nie było.",
      to_at: "Godzina po poprawce.",
      reason: "Powód.",
      corrected_by: "Kto poprawił.",
      corrected_at: "Kiedy.",
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "punch_conflicts",
    title: "Konflikty odbić",
    description: "Skany z kolejki offline, które nie pasowały do odbić zapisanych w międzyczasie.",
    columns: {
      id: "Identyfikator konfliktu.",
      company_id: COMPANY_ID,
      person_id: "Osoba.",
      location_id: "Budowa albo baza; puste, gdy kod plakatu przestał działać.",
      punched_by: "Kto skanował.",
      operation_id: OPERATION_ID,
      scanned_at: "Chwila skanu w telefonie.",
      received_at: "Kiedy skan dotarł na serwer.",
      confirm_exit: "Czy telefon potwierdził wyjście.",
      reason: "Przyczyna: kod_niewazny, budowa_zakonczona, pozniejsze_odbicie, nie_odbity_tu, juz_odbity_tu albo osoba_nieaktywna.",
      check_result: PUNCH_RESULT,
      check_distance_m: "Odległość od budowy, w metrach.",
      explained_at: "Kiedy konflikt wyjaśniono.",
      explained_by: "Kto wyjaśnił.",
      explanation: "Notatka wyjaśnienia.",
      sequence_number: SEQUENCE,
    },
  },
  {
    table: "push_subscriptions",
    title: "Urządzenia z powiadomieniami push",
    description: "Przeglądarki i aplikacje, w których użytkownik włączył powiadomienia.",
    columns: {
      id: "Identyfikator subskrypcji.",
      company_id: COMPANY_ID,
      user_id: "Konto.",
      kind: "Rodzaj: przegladarka albo aplikacja.",
      created_at: "Kiedy włączono.",
    },
    omitted: {
      endpoint: "adres usługi push urządzenia (klucz dostępu do powiadomień)",
      p256dh: "klucz szyfrowania powiadomień",
      auth: "sekret powiadomień",
      token: "token powiadomień aplikacji",
    },
  },
  {
    table: "support_threads",
    title: "Wątki czatu z supportem",
    description: "Jeden wątek czatu z GP Engineering na konto.",
    columns: {
      user_id: "Konto, którego to wątek.",
      company_id: COMPANY_ID,
      created_at: "Kiedy wątek powstał.",
      user_read_up_to: "Numer (`support_messages.sequence_number`) ostatniej wiadomości przeczytanej przez użytkownika.",
      support_read_up_to: "Numer ostatniej wiadomości przeczytanej przez GP Engineering.",
    },
  },
  {
    table: "support_messages",
    title: "Wiadomości czatu z supportem",
    description: "Wiadomości w wątkach czatu. Zdjęcie: `pliki/zdjecia-czatu/<id>.<rozszerzenie>`.",
    columns: {
      id: "Identyfikator wiadomości.",
      thread_id: "Wątek (konto użytkownika).",
      sender: "Nadawca: uzytkownik, support (GP Engineering) albo auto (wiadomość automatyczna).",
      author_id: "Konto autora (użytkownik albo pracownik GP Engineering); puste przy wiadomości automatycznej.",
      body: "Treść.",
      photo_path: "Klucz zdjęcia w magazynie plików; puste, gdy wiadomość nie ma zdjęcia.",
      role: "Rola użytkownika w chwili pisania.",
      screen: "Ekran, z którego pisał użytkownik.",
      app_version: "Wersja programu w chwili pisania.",
      created_at: "Kiedy wysłano.",
      client_operation_id: OPERATION_ID,
      sequence_number: SEQUENCE,
    },
  },
];

/** Pliki z magazynów: folder w eksporcie, wiersz, który na plik wskazuje, i kubełek. */
const FILE_FOLDERS = [
  { folder: "zdjecia-zgloszen", title: "Zdjęcia zgłoszeń", table: "issues", column: "photo_path", store: "photos" },
  { folder: "zdjecia-czatu", title: "Zdjęcia z czatu z supportem", table: "support_messages", column: "photo_path", store: "chatPhotos" },
  { folder: "dokumenty-terminow", title: "Dokumenty terminów", table: "tool_deadline_documents", column: "file_path", store: "documents" },
  { folder: "dokumenty-uprawnien", title: "Dokumenty uprawnień", table: "qualification_documents", column: "file_path", store: "documents" },
] as const;

interface ExportedColumn {
  name: string;
  type: string;
  description: string;
  /** Kolumna innej tabeli, na którą wskazuje (np. `tools.id`). */
  references: string[];
}

interface ExportedTable {
  spec: ExportTable;
  columns: ExportedColumn[];
  rows: (string | null)[][];
}

/** Migawka danych firmy z jednej chwili. */
export interface CompanyData {
  company: { id: string; name: string };
  tables: ExportedTable[];
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Wszystkie wiersze firmy z tabel eksportu, jako tekst. Transakcja systemowa; jej pierwsze polecenie robi z niej
 * transakcję tylko do odczytu z jedną migawką, więc tabele są ze sobą spójne, a eksport niczego nie zapisze. Nie
 * zależy od abonamentu: działa w trybie tylko do odczytu i po końcu umowy.
 */
export async function readCompany(sql: Sql, companyId: string): Promise<CompanyData> {
  await sql("set transaction isolation level repeatable read, read only");
  if (!UUID_PATTERN.test(companyId)) throw new RegistryError("not_found");
  const [company] = await sql<{ id: string; name: string }>("select id, name from app.companies where id = $1", [companyId]);
  if (!company) throw new RegistryError("not_found");

  const names = EXPORT_TABLES.map((spec) => spec.table);
  const catalog = await sql<{ table_name: string; column_name: string; udt_name: string; enum_values: string | null }>(
    `select c.table_name, c.column_name, c.udt_name,
       (select string_agg(e.enumlabel, ', ' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = c.udt_name) as enum_values
     from information_schema.columns c
     where c.table_schema = 'app' and c.table_name = any($1)`,
    [names],
  );
  const keys = await sql<{ table_name: string; column_name: string }>(
    `select t.relname as table_name, a.attname as column_name
     from pg_index i
     join pg_class t on t.oid = i.indrelid
     join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
     where i.indisprimary and t.relnamespace = 'app'::regnamespace and t.relname = any($1)
     order by array_position(i.indkey::int2[], a.attnum)`,
    [names],
  );
  // Klucze obce w obrębie `app`; para „company_id → company_id” w kluczach złożonych tylko pilnuje, że wiersz wskazuje
  // tę samą firmę, więc w README jej nie ma.
  const references = await sql<{ table_name: string; column_name: string; target: string }>(
    `select distinct src.relname as table_name, a.attname as column_name, dst.relname || '.' || b.attname as target
     from pg_constraint k
     join pg_class src on src.oid = k.conrelid
     join pg_class dst on dst.oid = k.confrelid
     cross join lateral unnest(k.conkey, k.confkey) as pair(src_attnum, dst_attnum)
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = pair.src_attnum
     join pg_attribute b on b.attrelid = k.confrelid and b.attnum = pair.dst_attnum
     where k.contype = 'f' and k.connamespace = 'app'::regnamespace and dst.relnamespace = 'app'::regnamespace
       and not (a.attname = 'company_id' and b.attname = 'company_id')
     order by 3`,
  );

  const tables: ExportedTable[] = [];
  for (const spec of EXPORT_TABLES) {
    const columns = Object.entries(spec.columns).map(([name, description]): ExportedColumn => {
      const column = catalog.find((row) => row.table_name === spec.table && row.column_name === name);
      if (!column || !IDENTIFIER.test(name)) throw new Error(`Eksport: nie ma kolumny ${spec.table}.${name}`);
      return {
        name,
        type: typeLabel(column.udt_name, column.enum_values),
        description,
        references: references.filter((row) => row.table_name === spec.table && row.column_name === name).map((row) => row.target),
      };
    });
    const udt = (name: string) => catalog.find((row) => row.table_name === spec.table && row.column_name === name)!.udt_name;
    const order = columns.some((column) => column.name === "sequence_number")
      ? ["sequence_number"]
      : keys.filter((key) => key.table_name === spec.table).map((key) => key.column_name);
    const rows = await sql<{ values: (string | null)[] }>(
      `select array[${columns.map((column) => asText(`t.${column.name}`, udt(column.name))).join(", ")}] as values
       from app.${spec.table} t
       where ${companyRows(spec.table)}
       order by ${order.map((name) => `t.${name}`).join(", ")}`,
      [companyId],
    );
    tables.push({ spec, columns, rows: rows.map((row) => row.values) });
  }
  return { company, tables };
}

/** Wiersze firmy `$1`: firma po `id`, wiadomości czatu po wątku, reszta po `company_id`. */
function companyRows(table: string) {
  if (table === "companies") return "t.id = $1";
  if (table === "support_messages") return "t.thread_id in (select user_id from app.support_threads where company_id = $1)";
  return "t.company_id = $1";
}

/** Wartość jako tekst do CSV: chwile w ISO 8601 w UTC, listy i JSON jako JSON, reszta w zapisie Postgresa. */
function asText(column: string, udt: string) {
  if (udt === "timestamptz") return `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  if (udt.startsWith("_")) return `to_jsonb(${column})::text`;
  return `${column}::text`;
}

const TYPE_LABELS: Record<string, string> = {
  uuid: "identyfikator (UUID)",
  text: "tekst",
  timestamptz: "chwila (ISO 8601, UTC)",
  date: "dzień (RRRR-MM-DD)",
  bool: "true / false",
  numeric: "liczba",
  float8: "liczba",
  int2: "liczba całkowita",
  int4: "liczba całkowita",
  int8: "liczba całkowita",
  jsonb: "JSON",
  _uuid: "lista identyfikatorów (JSON)",
};

function typeLabel(udt: string, enumValues: string | null) {
  if (enumValues) return `jedna z: ${enumValues}`;
  return TYPE_LABELS[udt] ?? udt;
}

/**
 * Zapisuje eksport do `add`: CSV każdej tabeli, pliki z magazynów i na końcu README. Plik, którego wiersz wskazuje,
 * a w magazynie go nie ma, nie zatrzymuje eksportu: trafia do podsumowania i README.
 */
export async function writeExport(data: CompanyData, stores: ExportStores, add: ExportSink, now: Date): Promise<CompanyExportSummary> {
  for (const table of data.tables) {
    await add(
      `dane/${table.spec.table}.csv`,
      csv(
        table.columns.map((column) => column.name),
        table.rows,
      ),
    );
  }
  let files = 0;
  const missingFiles: string[] = [];
  for (const folder of FILE_FOLDERS) {
    const table = data.tables.find((exported) => exported.spec.table === folder.table)!;
    const id = table.columns.findIndex((column) => column.name === "id");
    const key = table.columns.findIndex((column) => column.name === folder.column);
    for (const row of table.rows) {
      const storageKey = row[key];
      if (storageKey === null) continue;
      const path = `pliki/${folder.folder}/${row[id]}${extension(storageKey)}`;
      const blob = await stores[folder.store].read(storageKey);
      if (!blob) {
        missingFiles.push(path);
        continue;
      }
      await add(path, new Uint8Array(await blob.arrayBuffer()));
      files += 1;
    }
  }
  await add("README.md", new TextEncoder().encode(readme(data, missingFiles, now)));
  return { companyName: data.company.name, tables: data.tables.length, files, missingFiles };
}

/** Rozszerzenie z klucza w magazynie (z kropką), np. `.jpg`; puste, gdy klucz go nie ma. */
function extension(storageKey: string) {
  return storageKey.match(/\.[a-z0-9]{1,5}$/i)?.[0].toLowerCase() ?? "";
}

/** Opis eksportu dla klienta: zawartość, format, pliki, powiązania i znaczenie każdej kolumny. */
function readme(data: CompanyData, missingFiles: string[], now: Date) {
  const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = [
    `# Eksport danych firmy ${data.company.name}`,
    "",
    `Identyfikator firmy: \`${data.company.id}\`. Przygotowano: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    "Wszystkie dane firmy zapisane w NarzędziownikuGP: każda tabela jako plik CSV, a zdjęcia i dokumenty w oryginalnym",
    "formacie. Haseł, sesji logowania i kluczy powiadomień push eksport nie zawiera.",
    "",
    "## Zawartość",
    "",
    "- `README.md`: ten opis.",
    ...data.tables.map((table) => `- \`dane/${table.spec.table}.csv\`: ${table.spec.title} (wierszy: ${table.rows.length}).`),
    ...FILE_FOLDERS.map((folder) => `- \`pliki/${folder.folder}/\`: ${folder.title}.`),
    "",
    "## Format plików CSV",
    "",
    "- Kodowanie UTF-8 bez BOM, przecinek między polami, wiersz kończy CRLF (RFC 4180). Pole z przecinkiem, cudzysłowem",
    "  albo końcem wiersza jest w cudzysłowie, a cudzysłów w nim jest podwojony.",
    "- Pierwszy wiersz to nazwy kolumn, opisane niżej. Plik tabeli bez wierszy ma sam nagłówek.",
    '- Puste pole to brak wartości, a `""` to pusty tekst.',
    "- Chwile są w UTC w zapisie ISO 8601 (np. `2026-03-02T06:00:00.000000Z`); czas polski to UTC+1 zimą i UTC+2 latem.",
    "  Dni (np. termin, „ważne do”) są w zapisie RRRR-MM-DD.",
    "- Liczby mają kropkę dziesiętną, a kwoty są w złotych. Wartości logiczne to `true` i `false`.",
    "- Identyfikatory to UUID. Kolumna z powiązaniem wskazuje wiersz innej tabeli, np. `tools.location_id` to `locations.id`.",
    "- Wiersze są w kolejności zapisu (`sequence_number`), a w tabelach bez niej po kluczu głównym.",
    "",
    "## Zdjęcia i dokumenty",
    "",
    "Każdy plik nazywa się identyfikatorem wiersza, do którego należy, z rozszerzeniem oryginału (jpg, png, webp albo pdf).",
    "Oryginalną nazwę dokumentu podaje kolumna `file_name`.",
    "",
    "| Folder | Wiersz | Przykład |",
    "| --- | --- | --- |",
    ...FILE_FOLDERS.map((folder) => `| \`pliki/${folder.folder}/\` | \`${folder.table}.id\` | \`pliki/${folder.folder}/<${folder.table}.id>.<rozszerzenie>\` |`),
    "",
    ...(missingFiles.length > 0
      ? [
          "Tych plików wskazanych w danych nie było w magazynie plików w chwili eksportu:",
          "",
          ...missingFiles.map((path) => `- \`${path}\``),
          "",
        ]
      : []),
    "## Najważniejsze powiązania",
    "",
    "- Narzędzie (`tools`) ma kategorię (`categories`) i obecną lokalizację (`locations`); jego historia to ruchy",
    "  (`movements`), a które narzędzia objął ruch, mówi `movement_tools`.",
    "- Wartość narzędzia: obecna w `tool_values`, zmiany w `tool_value_history`; stawki do kosztu sprzętu w `daily_rates`",
    "  i `rental_rates`.",
    "- Konto (`users.user_id`) jest autorem ruchów, zgłoszeń, komentarzy i odbić; osoba z kartoteki (`people`) może mieć",
    "  konto (`people.user_id`). Odbicia (`punches`) i uprawnienia (`qualifications`) należą do osoby (`person_id`).",
    "- Termin (`tool_deadlines`) należy do narzędzia albo pojazdu (`vehicle_id` to `locations.id`), a jego dokumenty są",
    "  w `tool_deadline_documents`. Dokumenty uprawnień są w `qualification_documents`.",
    "- Zgłoszenie (`issues`) ma komentarze (`issue_comments`); wątek czatu (`support_threads`) ma wiadomości",
    "  (`support_messages.thread_id`).",
    "",
    "## Tabele",
  ];
  for (const table of data.tables) {
    lines.push(
      "",
      `### \`dane/${table.spec.table}.csv\`: ${table.spec.title}`,
      "",
      table.spec.description,
      "",
      "| Kolumna | Typ | Znaczenie | Powiązanie |",
      "| --- | --- | --- | --- |",
      ...table.columns.map(
        (column) =>
          `| \`${column.name}\` | ${cell(column.type)} | ${cell(column.description)} | ${column.references.map((target) => `\`${target}\``).join(", ")} |`,
      ),
    );
    const omitted = Object.entries(table.spec.omitted ?? {});
    if (omitted.length > 0) lines.push("", `Pominięte kolumny: ${omitted.map(([name, reason]) => `\`${name}\` (${reason})`).join(", ")}.`);
  }
  return lines.join("\n") + "\n";
}
