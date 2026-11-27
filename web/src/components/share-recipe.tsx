"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ShareIcon } from "@/components/icons";

type Props = {
  title: string;
  visibility: "private" | "public";
  /** Name of the recipe book, to say who can open a private recipe. */
  bookName: string | null;
  /** Lets editors switch visibility right here; absent for everyone else. */
  setVisibility?: (visibility: "private" | "public") => Promise<void>;
};

/** Share icon next to the recipe title: copy link / system share sheet, and who can open the link. */
export function ShareRecipe({ title, visibility, bookName, setVisibility }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const url = () => window.location.href.split(/[?#]/)[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Link kopieren:", url());
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url: url() });
    } catch {
      // Cancelled by the user: nothing to do.
    }
  }

  return (
    <div className="popover-anchor" ref={box}>
      <button
        type="button"
        className="secondary icon-button"
        aria-label="Teilen"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ShareIcon />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Rezept teilen">
          <p className="popover-title">Rezept teilen</p>
          <div className="toolbar">
            <button type="button" className="btn-small" onClick={copy}>
              {copied ? "Link kopiert ✓" : "Link kopieren"}
            </button>
            {canNativeShare && (
              <button type="button" className="secondary btn-small" onClick={nativeShare}>
                Teilen …
              </button>
            )}
          </div>
          <p className="hint">
            {visibility === "public"
              ? "Öffentlich: Jede Person mit dem Link kann das Rezept ansehen, auch ohne Konto."
              : `Privat: Nur Mitglieder${bookName ? ` von „${bookName}“` : " des Rezeptbuchs"} können den Link öffnen.`}
          </p>
          {setVisibility && (
            <button
              type="button"
              className="secondary btn-small"
              disabled={pending}
              onClick={() => startTransition(() => setVisibility(visibility === "public" ? "private" : "public"))}
            >
              {pending ? "Wird gespeichert…" : visibility === "public" ? "Wieder privat machen" : "Öffentlich machen"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
