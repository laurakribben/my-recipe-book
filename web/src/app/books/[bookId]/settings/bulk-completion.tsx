"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BatchResult } from "../../actions";

type Count = { label: string; missing: number; runnable: number };
type Props = {
  counts: Count[];
  /** Recipes that miss something the app can fill in. */
  todo: number;
  run: (after: string | null) => Promise<BatchResult>;
};

type Phase = "idle" | "running" | "stopping" | "finished";

/** "Fehlendes in allen Rezepten ergänzen": completes the book's recipes a few at a time. */
export function BulkCompletion({ counts, todo, run }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(todo);
  const [handled, setHandled] = useState(0);
  const [problems, setProblems] = useState<{ title: string; failed: string[] }[]>([]);
  const [message, setMessage] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);
  const stop = useRef(false);

  async function start() {
    stop.current = false;
    setPhase("running");
    setTotal(todo);
    setHandled(0);
    setProblems([]);
    setMessage(null);

    let after: string | null = null;
    let count = 0;
    let failedRecipes = 0;
    let end: { kind: "success" | "warning" | "error"; text: string } | null = null;
    try {
      do {
        const result: BatchResult = await run(after);
        if ("error" in result) {
          end = { kind: "error", text: result.error };
          break;
        }
        count += result.processed.length;
        setHandled(count);
        const withProblems = result.processed.filter((p) => p.failed.length > 0);
        failedRecipes += withProblems.length;
        if (withProblems.length) setProblems((prev) => [...prev, ...withProblems]);
        if (result.limitReached) {
          end = { kind: "warning", text: "Das Tageslimit für die KI ist erreicht. Morgen kannst du hier weitermachen." };
          break;
        }
        after = result.next;
      } while (after && !stop.current);
    } catch {
      end = { kind: "error", text: "Die Verbindung ist abgebrochen. Du kannst es einfach noch einmal starten." };
    }

    if (!end) {
      const recipes = (n: number) => `${n} ${n === 1 ? "Rezept" : "Rezepten"}`;
      end = stop.current
        ? { kind: "warning", text: `Angehalten nach ${recipes(count)}.` }
        : failedRecipes
          ? { kind: "warning", text: `Fertig. Bei ${recipes(failedRecipes)} hat nicht alles geklappt – siehe unten.` }
          : { kind: "success", text: `Fertig: ${recipes(count)} ergänzt.` };
    }
    setMessage(end);
    setPhase("finished");
    router.refresh();
  }

  const busy = phase === "running" || phase === "stopping";
  const shown = Math.min(handled, total);

  return (
    <section>
      <h2>Fehlendes in allen Rezepten ergänzen</h2>
      <ul className="completion-list">
        {counts.map((c) => (
          <li key={c.label}>
            <span aria-hidden="true">{c.missing === 0 ? "✓" : c.runnable > 0 ? "○" : "–"}</span> {c.label}
            <span className="muted">
              {" – "}
              {c.missing === 0
                ? "überall vorhanden"
                : `fehlt bei ${c.missing}` +
                  (c.runnable === c.missing ? "" : `, davon ${c.runnable} automatisch ergänzbar`)}
            </span>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="bulk-progress" role="status">
          <progress value={shown} max={Math.max(total, 1)} />
          <span>
            {shown} von {total} Rezepten{phase === "stopping" ? " – wird nach diesem Schritt angehalten…" : "…"}
          </span>
        </div>
      )}
      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
      {problems.length > 0 && (
        <details className="disclosure">
          <summary>
            Hinweise zu {problems.length} {problems.length === 1 ? "Rezept" : "Rezepten"}
          </summary>
          <ul className="small">
            {problems.map((p, i) => (
              <li key={i}>
                <strong>{p.title}:</strong> {p.failed.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="row">
        {busy ? (
          <button
            type="button"
            className="secondary"
            disabled={phase === "stopping"}
            onClick={() => {
              stop.current = true;
              setPhase("stopping");
            }}
          >
            Anhalten
          </button>
        ) : (
          <button type="button" onClick={start} disabled={todo === 0}>
            {todo === 0
              ? "Nichts zu ergänzen"
              : `Alles Fehlende ergänzen (${todo} ${todo === 1 ? "Rezept" : "Rezepte"})`}
          </button>
        )}
      </div>
      <p className="hint">
        Bilder kommen von der Quellseite, Nährwerte werden von der KI geschätzt und als Schätzung gekennzeichnet.
        Läuft in kleinen Schritten – lass die Seite dabei geöffnet.
      </p>
    </section>
  );
}
