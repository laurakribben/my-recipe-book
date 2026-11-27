"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ImportResult } from "@/app/recipes/actions";

type Row = { url: string; state: "waiting" | "running" | "done" | "failed"; result?: ImportResult };

const MAX_LINKS = 20;
/** Links read at the same time. */
const PARALLEL = 2;

/** "Mehrere Links": imports several recipes one after another and saves them right away. */
export function MultiImport({
  importLink,
  bookHref,
}: {
  importLink: (url: string, targetServings: number | null) => Promise<ImportResult>;
  bookHref: string;
}) {
  const [text, setText] = useState("");
  const [servings, setServings] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const links = [...new Set(text.split(/\s+/).filter((l) => /^https?:\/\//i.test(l)))];

  async function start() {
    const list = links.slice(0, MAX_LINKS);
    const target = Number(servings) > 0 ? Number(servings) : null;
    stop.current = false;
    setRunning(true);
    setRows(list.map((url) => ({ url, state: "waiting" })));
    const update = (i: number, row: Partial<Row>) =>
      setRows((prev) => prev && prev.map((r, j) => (j === i ? { ...r, ...row } : r)));

    let next = 0;
    async function worker() {
      while (next < list.length && !stop.current) {
        const i = next++;
        update(i, { state: "running" });
        let result: ImportResult;
        try {
          result = await importLink(list[i], target);
        } catch {
          result = { ok: false, error: "Die Verbindung ist abgebrochen." };
        }
        update(i, { state: result.ok ? "done" : "failed", result });
        if (!result.ok && result.error.startsWith("Tageslimit")) stop.current = true;
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));
    setRunning(false);
  }

  if (rows) {
    const done = rows.filter((r) => r.state === "done").length;
    const finished = rows.filter((r) => r.state === "done" || r.state === "failed").length;
    return (
      <div>
        <div className="bulk-progress" role="status">
          <progress value={finished} max={rows.length} />
          <span>
            {finished} von {rows.length} Links
            {running ? "…" : ` – ${done} ${done === 1 ? "Rezept" : "Rezepte"} gespeichert`}
          </span>
        </div>
        <ul className="import-list">
          {rows.map((r, i) => (
            <li key={i} className={r.state}>
              <span className="import-state" aria-hidden="true">
                {r.state === "done" ? "✓" : r.state === "failed" ? "✕" : r.state === "running" ? "…" : "○"}
              </span>
              <span className="import-text">
                {r.result?.ok ? (
                  <>
                    <Link href={`/recipes/${r.result.id}`}>{r.result.title}</Link>
                    {r.result.incomplete && <span className="badge">unvollständig</span>}
                  </>
                ) : (
                  <span className="import-url">{r.url}</span>
                )}
                {r.result && !r.result.ok && <span className="import-error">{r.result.error}</span>}
                {r.state === "running" && <span className="muted small"> wird gelesen…</span>}
                {r.state === "waiting" && !running && <span className="muted small"> nicht gestartet</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="toolbar">
          {running ? (
            <button type="button" className="secondary" onClick={() => (stop.current = true)}>
              Anhalten
            </button>
          ) : (
            <>
              <Link href={bookHref} className="button">
                Zum Rezeptbuch
              </Link>
              <button type="button" className="secondary" onClick={() => setRows(null)}>
                Weitere Links
              </button>
            </>
          )}
        </div>
        {!running && done > 0 && (
          <p className="hint">
            Die Rezepte sind ohne Prüfung gespeichert – schau sie dir kurz an, die KI kann sich irren. Fehlendes wie
            Nährwerte ergänzt du in den Einstellungen des Rezeptbuchs.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (links.length > 0) start();
      }}
    >
      <label className="field">
        <span>Links zu Rezepten</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          required
          placeholder={"https://…\nhttps://…"}
        />
        <span className="hint">
          Ein Link pro Zeile, bis zu {MAX_LINKS}. Rezept-Websites und YouTube; Instagram und TikTok bitte einzeln über
          „Text“ oder „Fotos“. Die Rezepte werden direkt gespeichert.
        </span>
      </label>
      <label className="field">
        <span>Portionen (optional)</span>
        <input
          type="number"
          min={1}
          max={50}
          step={1}
          inputMode="numeric"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="wie im Rezept"
          style={{ maxWidth: "10rem" }}
        />
      </label>
      {links.length > MAX_LINKS && (
        <p className="notice warning">
          Es sind {links.length} Links – die ersten {MAX_LINKS} werden eingelesen.
        </p>
      )}
      <button type="submit" disabled={links.length === 0}>
        {links.length > 1 ? `${Math.min(links.length, MAX_LINKS)} Rezepte einlesen` : "Rezepte einlesen"}
      </button>
    </form>
  );
}
