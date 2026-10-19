"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { t } from "@/i18n/t";
import { HELP_HREF, helpLink, isCurrentNavItem, SCAN_HREF } from "@/lib/nav-path";
import type { Navigation, NavIcon } from "@/lib/navigation";
import { requestScan } from "@/lib/scan-request";

const ICON_PATHS: Record<NavIcon, ReactNode> = {
  board: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  tools: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z" />
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  sites: (
    <>
      <path d="M2 20h20" />
      <path d="M4 20v-4a8 8 0 0 1 16 0v4" />
      <path d="M10 8V5h4v3" />
    </>
  ),
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  deadlines: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M12 14v3l2 1" />
    </>
  ),
  report: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  mine: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </>
  ),
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Od szerokości tabletu nawigacja jest panelem bocznym; ten sam próg co w `globals.css`. */
const WIDE = "(min-width: 768px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Szeroki ekran; serwer zakłada telefon, a przeglądarka poprawia to zaraz po załadowaniu. */
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * Nawigacja konta (`navigation`): jeden element, który na telefonie jest dolnym paskiem, a od szerokości tabletu stałym
 * panelem bocznym. „Więcej” (u pracownika „Moje”) na telefonie otwiera arkusz nad paskiem, który zamyka ten sam
 * przycisk, Escape (fokus wraca na przycisk), kliknięcie obok, wyjście z niego klawiszem Tab i każde przejście na inną
 * stronę (także przyciskiem wstecz). Na komputerze rozwija listę w panelu i zostaje rozwinięte między stronami;
 * na stronie spod „Więcej” jest rozwinięte od razu. Bieżąca strona jest wyróżniona.
 */
export function AppNavigation({ bar, more, helpCount }: Pick<Navigation, "bar" | "more"> & { helpCount: number }) {
  const pathname = usePathname();
  const wide = useWide();
  const moreCurrent = more.some((group) => group.items.some((item) => isCurrentNavItem(item.href, pathname)));
  // Arkusz na telefonie jest otwarty na stronie, na której go otwarto; lista w panelu bocznym zostaje rozwinięta.
  const [sheetOn, setSheetOn] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(moreCurrent);
  const open = wide ? listOpen : sheetOn === pathname;
  const sheetOpen = !wide && open;
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const toggle = () => (wide ? setListOpen(!open) : setSheetOn(open ? null : pathname));

  useEffect(() => {
    if (!sheetOpen) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Fokus wraca na przycisk tylko z arkusza; Escape w innym oknie (np. przewodniku demo) go nie zabiera.
      const focusInside = rootRef.current?.contains(document.activeElement) ?? false;
      setSheetOn(null);
      if (focusInside) toggleRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setSheetOn(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [sheetOpen]);

  return (
    <nav
      ref={rootRef}
      className="app-nav"
      aria-label={t("nav.title")}
      onBlur={(event) => {
        if (sheetOpen && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setSheetOn(null);
      }}
    >
      {/* role: bez punktorów Safari nie czyta listy jako listy. */}
      <ul role="list" className="app-nav-bar">
        {bar.map((item) => (
          <li key={item.label}>
            {item.kind === "link" ? (
              <Link
                href={item.href}
                className={item.primary ? "app-nav-item app-nav-scan" : "app-nav-item"}
                aria-current={isCurrentNavItem(item.href, pathname) ? "page" : undefined}
                data-tour={item.primary ? "scan" : item.icon === "report" ? "report" : undefined}
                onClick={(event) => {
                  setSheetOn(null);
                  // Na tablicy skaner otwiera się na miejscu, także bez zasięgu.
                  if (item.href === SCAN_HREF && pathname === "/" && requestScan()) event.preventDefault();
                }}
              >
                <Icon name={item.icon} />
                <span className="app-nav-label">{item.label}</span>
              </Link>
            ) : (
              <button
                ref={toggleRef}
                type="button"
                className="app-nav-item"
                aria-expanded={open}
                aria-controls={`${id}-more`}
                data-current={moreCurrent || undefined}
                onClick={toggle}
              >
                <Icon name={item.icon} />
                <span className="app-nav-label">{item.label}</span>
                {helpCount > 0 && <span className="app-nav-dot" aria-hidden />}
              </button>
            )}
          </li>
        ))}
      </ul>
      {more.length > 0 && (
        <div ref={panelRef} id={`${id}-more`} className="app-nav-more" hidden={!open}>
          {more.map((group, index) => (
            <div key={group.label ?? index} className="app-nav-group">
              {group.label && (
                <p id={`${id}-group-${index}`} className="app-nav-group-title">
                  {group.label}
                </p>
              )}
              <ul role="list" aria-labelledby={group.label ? `${id}-group-${index}` : undefined}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href === HELP_HREF ? helpLink(pathname) : item.href}
                      className="app-nav-link"
                      aria-current={isCurrentNavItem(item.href, pathname) ? "page" : undefined}
                      onClick={() => setSheetOn(null)}
                    >
                      {item.label}
                      {item.href === HELP_HREF && helpCount > 0 && (
                        <span className="app-nav-count" data-testid="help-count">
                          {helpCount > 99 ? "99+" : helpCount}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
