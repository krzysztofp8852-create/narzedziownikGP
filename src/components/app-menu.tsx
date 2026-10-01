"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/i18n/t";
import type { MenuGroup } from "@/lib/app-menu";
import { isCurrentMenuItem } from "@/lib/menu-path";
import { SignOutForm } from "./sign-out-form";

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

/**
 * Przycisk trzech kresek w nagłówku i panel z podstronami aktora (pozycje liczy serwer, `appMenu`). Bieżąca podstrona
 * jest wyróżniona. Panel zamyka przycisk, Escape (fokus wraca na przycisk), kliknięcie obok, wyjście z niego
 * klawiszem Tab, wybór pozycji i każde przejście na inną stronę (także wstecz w przeglądarce).
 */
export function AppMenu({ groups }: { groups: MenuGroup[] }) {
  const pathname = usePathname();
  // Panel jest otwarty na stronie, na której go otwarto; po przejściu gdzie indziej sam się zamyka.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Fokus wraca na przycisk tylko z menu; Escape w innym oknie (np. przewodniku demo) go nie zabiera.
      const focusInside = rootRef.current?.contains(document.activeElement) ?? false;
      setOpenOn(null);
      if (focusInside) buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div
      className="app-menu"
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="button button-quiet icon-button"
        aria-label={t("menu.title")}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        title={t("menu.title")}
        data-tour="menu"
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        <MenuIcon />
        <span className="icon-button-label">{t("menu.title")}</span>
      </button>
      <nav ref={panelRef} id={`${id}-panel`} className="app-menu-panel" aria-label={t("menu.title")} hidden={!open}>
        {groups.map((group, index) => (
          <div key={group.label} className="app-menu-group">
            <p id={`${id}-group-${index}`} className="app-menu-group-title">
              {group.label}
            </p>
            {/* role: bez punktorów Safari nie czyta listy jako listy. */}
            <ul role="list" aria-labelledby={`${id}-group-${index}`}>
              {group.items.map((item) => (
                <li key={item.label}>
                  {item.kind === "link" ? (
                    <Link
                      href={item.href}
                      className="app-menu-link"
                      aria-current={isCurrentMenuItem(item.href, pathname) ? "page" : undefined}
                      onClick={close}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <SignOutForm className="app-menu-link" label={item.label} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
