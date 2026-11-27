"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, NavIcon } from "@/components/nav-items";

/** Bottom navigation on phones (hidden on wide screens and in cooking mode). */
export function TabBar() {
  const pathname = usePathname();
  if (pathname.endsWith("/cook")) return null;
  return (
    <nav className="tab-bar" aria-label="Hauptnavigation">
      {NAV_ITEMS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""}>
            <NavIcon path={t.icon} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
