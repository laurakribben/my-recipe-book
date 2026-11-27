"use client";

import { useEffect, useState } from "react";

const STEPS: Record<string, [label: string, fromSecond: number][]> = {
  link: [
    ["Webseite wird geladen", 0],
    ["KI liest das Rezept", 3],
    ["Übersetzt und ordnet die Zutaten den Schritten zu", 10],
    ["Sucht ein Bild, falls die Seite keins hat", 20],
    ["Fast fertig", 28],
  ],
  text: [
    ["KI liest den Text", 0],
    ["Übersetzt und ordnet die Zutaten den Schritten zu", 7],
    ["Sucht ein passendes Bild mit freier Lizenz", 16],
    ["Fast fertig", 26],
  ],
  images: [
    ["Bilder werden verkleinert und hochgeladen", 0],
    ["KI liest die Bilder", 3],
    ["Übersetzt und ordnet die Zutaten den Schritten zu", 13],
    ["Sucht ein passendes Bild mit freier Lizenz", 23],
    ["Fast fertig", 32],
  ],
};

/**
 * Shown while the AI reads a recipe. The server answers only once at the end, so the
 * steps advance by typical durations; the list says so.
 */
export function AiProgress({ mode }: { mode: "link" | "text" | "images" }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);

  const steps = STEPS[mode];
  const current = steps.reduce((at, [, from], i) => (seconds >= from ? i : at), 0);

  return (
    <div className="ai-progress" role="status" aria-live="polite">
      <ol>
        {steps.map(([label], i) => (
          <li key={label} className={i < current ? "done" : i === current ? "current" : ""}>
            <span aria-hidden="true">{i < current ? "✓" : i === current ? "" : "○"}</span>
            {label}
            {i === current && "…"}
          </li>
        ))}
      </ol>
      <p className="hint">Dauert meist 10–30 Sekunden ({Math.floor(seconds)} s). Die Schritte sind geschätzt.</p>
    </div>
  );
}
