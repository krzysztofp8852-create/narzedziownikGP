import { t } from "@/i18n/t";

/** Szara kreska w miejscu tekstu albo przycisku; szerokość i wysokość tylko udają to, co przyjdzie. */
function Bone({ width, height = 16 }: { width: string; height?: number }) {
  return <span className="skeleton-bone" style={{ width, height }} />;
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton-card">
      <Bone width="40%" height={22} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Bone width="64px" height={22} />
          <Bone width={`${70 - i * 12}%`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Zarys strony pokazywany od razu po kliknięciu, zanim serwer odda dane (loading.tsx): powrót, tytuł, wstęp i karty
 * z wierszami, czyli to, z czego składa się prawie każdy ekran. Pojawia się z opóźnieniem, więc szybkie przejście
 * nie mignie szarym ekranem.
 */
export function PageSkeleton() {
  return (
    <div className="skeleton" role="status" aria-busy="true" data-testid="page-skeleton">
      <span className="skeleton-label">{t("header.loading")}</span>
      <Bone width="90px" height={14} />
      <Bone width="min(320px, 70%)" height={32} />
      <Bone width="min(560px, 90%)" />
      <div className="skeleton-grid">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={2} />
      </div>
    </div>
  );
}
