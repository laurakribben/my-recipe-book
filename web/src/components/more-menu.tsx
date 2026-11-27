"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreIcon } from "@/components/icons";

/**
 * An icon button that opens a small panel below it. "menu": a list of actions (links, or
 * buttons in forms), closed when one is chosen. "panel": any content, e.g. a short form,
 * closed when it is submitted. Escape or a click outside closes it too.
 */
export function IconPopover({
  icon,
  label,
  variant = "panel",
  children,
}: {
  icon: ReactNode;
  label: string;
  variant?: "menu" | "panel";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Closed a moment later: a form must still be on the page while it is being submitted.
  const closeSoon = () => setTimeout(() => setOpen(false), 0);

  return (
    <div className="popover-anchor" ref={root}>
      <button
        type="button"
        className="secondary icon-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup={variant === "menu" ? "menu" : "dialog"}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
      </button>
      {open && (
        <div
          className={variant === "menu" ? "popover menu" : "popover"}
          role={variant === "menu" ? "menu" : "dialog"}
          aria-label={label}
          onClick={variant === "menu" ? (e) => (e.target as HTMLElement).closest("a, button") && closeSoon() : undefined}
          onSubmit={closeSoon}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** "⋯" button with a menu of further actions. */
export function MoreMenu({ label = "Weitere Aktionen", children }: { label?: string; children: ReactNode }) {
  return (
    <IconPopover icon={<MoreIcon />} label={label} variant="menu">
      {children}
    </IconPopover>
  );
}
