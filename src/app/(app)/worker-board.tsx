import { EmptyState } from "@/components/empty-state";
import { ToolList } from "@/components/tool-list";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { equipmentWherePunched, type EquipmentWherePunched } from "@/lib/worker-board";
import { canPunchOthers, type Session } from "@/registry/registry";
import { BoardSnapshot } from "./board-snapshot";
import { NeedsAttention } from "./needs-attention";
import { PunchStatus } from "./punch-status";
import { ScanPanel } from "./scan-panel";
import { ForgetBoardParam } from "./board-param";

/** Sprzęt dzisiejszej budowy, tylko do podglądu; bez odbicia podpowiedź, jak się odbić. */
function TodaysEquipment({ equipment, readOnly }: { equipment: EquipmentWherePunched | null; readOnly: boolean }) {
  if (!equipment) {
    // W trybie tylko do odczytu nikt się nie odbija, więc nie ma czego podpowiadać.
    if (readOnly) return null;
    return (
      <section className="board-section" aria-labelledby="todays-equipment">
        <h2 id="todays-equipment" className="display section-title">
          {t("workerBoard.equipmentTitle")}
        </h2>
        <EmptyState step={{ kind: "scan", label: t("nav.scan") }}>{t("workerBoard.punchHint")}</EmptyState>
      </section>
    );
  }
  const { place, tools } = equipment;
  const atBase = place.kind === "baza";
  return (
    <section className="board-section" aria-labelledby="todays-equipment">
      <h2 id="todays-equipment" className="display section-title">
        {t(atBase ? "workerBoard.equipmentBase" : "workerBoard.equipmentSite", { place: place.name })}
      </h2>
      {tools.length === 0 ? (
        <EmptyState>{t(atBase ? "board.baseEmpty" : "board.siteEmpty")}</EmptyState>
      ) : (
        <ToolList tools={tools} wide atBase={atBase} />
      )}
    </section>
  );
}

/**
 * Tablica pracownika mówi o nim, a nie o całej firmie: pasek stanu odbicia, jego sprawy z „Do zrobienia” (kończące się
 * uprawnienia, odpowiedzi na zgłoszenia) i sprzęt na budowie z otwartego odbicia. Skanuj otwiera na niej skaner, który
 * plakat prowadzi do odbicia, a naklejkę do karty narzędzia.
 */
export async function WorkerBoard({ session, scan }: { session: Session; scan: boolean }) {
  const readOnly = session.company.readOnly;
  const registry = getRegistry().as(session.userId);
  const [board, { toDo }, openPunch] = await Promise.all([registry.whereIsWhat(), registry.inbox(), registry.ownOpenPunch()]);
  // Chwila pobrania stanu: tablica z kopii w telefonie pokazuje ją bez sieci (service worker czyta ją z atrybutu).
  const fetchedAt = new Date().toISOString();
  // Bez wylogowania po bezczynności kopia tablicy zostaje w telefonie (ADR 0044), jak na tablicy pozostałych ról.
  const keepCopy = session.idleLogoutMinutes === null;
  const tools = [board.base, ...board.sites, ...board.vehicles, ...board.services].flatMap((place) => place.tools);

  return (
    <>
      {!readOnly && <PunchStatus open={openPunch} now={new Date(fetchedAt)} />}
      {scan && <ForgetBoardParam />}
      {!readOnly && (
        <ScanPanel
          userId={session.userId}
          punchesOthers={canPunchOthers(session)}
          tools={[...tools, ...board.lost].map(({ id, code }) => ({ id, code }))}
          opened={scan}
        />
      )}
      <div className="board board-worker" data-fetched-at={fetchedAt} {...(keepCopy ? {} : { "data-no-copy": "" })}>
        <BoardSnapshot fetchedAt={fetchedAt} keepCopy={keepCopy} />
        <h1 className="display page-title">{t("nav.board")}</h1>
        <NeedsAttention items={toDo} />
        <TodaysEquipment equipment={equipmentWherePunched(board, openPunch)} readOnly={readOnly} />
      </div>
    </>
  );
}
