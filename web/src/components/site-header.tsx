"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS, NavIcon } from "@/components/nav-items";

/**
 * Top bar: "Mein Rezeptbuch", icons for the main areas (wide screens; phones use the tab
 * bar), and on the right the user's name and a menu with "Konto" and "Abmelden".
 */
export function SiteHeader({ userName }: { userName: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Close the menu on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          Mein Rezeptbuch
        </Link>

        {userName && (
          <nav className="header-nav" aria-label="Hauptnavigation">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : undefined}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.title}
                  title={item.title}
                >
                  <NavIcon path={item.icon} />
                </Link>
              );
            })}
          </nav>
        )}

        <div className="header-user">
          {userName ? (
            <>
              <span className="header-name" title={userName}>
                {userName}
              </span>
              <div className="popover-anchor" ref={menu}>
                <button
                  type="button"
                  className="header-menu-button"
                  aria-label="Menü"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={() => setOpen((o) => !o)}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                {open && (
                  <div className="popover header-menu" role="menu">
                    <Link href="/konto" role="menuitem" onClick={() => setOpen(false)}>
                      Konto
                    </Link>
                    <form action="/auth/signout" method="post">
                      <button type="submit" role="menuitem">
                        Abmelden
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href="/login" className="header-login">
              Anmelden
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
