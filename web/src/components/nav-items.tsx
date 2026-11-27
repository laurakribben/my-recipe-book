/** Main destinations, shared by the header (wide screens) and the tab bar (phones). */
export const NAV_ITEMS = [
  {
    href: "/",
    label: "Start",
    title: "Start: heute und Rezeptbücher",
    match: (p: string) => p === "/" || p.startsWith("/books") || p.startsWith("/recipes"),
    icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  },
  {
    href: "/suche",
    label: "Suche",
    title: "Rezepte suchen",
    match: (p: string) => p.startsWith("/suche"),
    icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  },
  {
    href: "/neu",
    label: "Neu",
    title: "Rezept hinzufügen",
    match: (p: string) => p.startsWith("/neu") || p.endsWith("/new"),
    icon: "M12 5v14M5 12h14",
  },
  {
    href: "/plans",
    label: "Woche",
    title: "Wochenplan",
    match: (p: string) => p.startsWith("/plans") && !p.includes("/einkauf"),
    icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  },
  {
    href: "/einkauf",
    label: "Einkauf",
    title: "Einkaufsliste",
    match: (p: string) => p.startsWith("/einkauf") || p.includes("/einkauf"),
    icon: "M4 5h2l2 11h10l2-8H7M10 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01",
  },
];

export function NavIcon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
