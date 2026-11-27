"use client";

import { useActionState } from "react";
import type { CompleteState } from "@/app/recipes/actions";
import type { CompletionItem } from "@/lib/recipe-completion";

type Props = {
  items: CompletionItem[];
  complete: (prev: CompleteState, formData: FormData) => Promise<CompleteState>;
};

/** "Fehlendes mit KI ergänzen": lists what the recipe lacks and fills it in on request. */
export function CompletionPanel({ items, complete }: Props) {
  const [state, action, pending] = useActionState(complete, null);
  const runnable = items.filter((i) => i.missing && !i.blockedReason);
  const stepsAssigned = items.find((i) => i.id === "step_ingredients" && !i.missing);

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Fehlendes mit KI ergänzen</h2>
      <ul className="completion-list">
        {items.map((i) => (
          <li key={i.id}>
            <span aria-hidden="true">{i.missing ? (i.blockedReason ? "–" : "○") : "✓"}</span>{" "}
            {i.label}
            {!i.missing && <span className="muted"> – vorhanden</span>}
            {i.missing && !i.blockedReason && <span className="muted"> – fehlt, kann ergänzt werden</span>}
            {i.blockedReason && <span className="muted"> – {i.blockedReason}</span>}
          </li>
        ))}
      </ul>

      {state && "error" in state && <p className="notice error">{state.error}</p>}
      {state && "done" in state && (state.done.length > 0 || state.failed.length > 0) && (
        <div className={state.failed.length ? "notice warning" : "notice success"}>
          {state.done.length > 0 && <p style={{ margin: 0 }}>Ergänzt: {state.done.join(", ")}.</p>}
          {state.failed.map((f) => (
            <p key={f} style={{ margin: 0 }}>Nicht geklappt – {f}</p>
          ))}
        </div>
      )}

      <form action={action} className="row">
        <button type="submit" disabled={pending || runnable.length === 0}>
          {pending ? "Wird ergänzt…" : runnable.length === 0 ? "Nichts zu ergänzen" : "Fehlendes ergänzen"}
        </button>
        {stepsAssigned && (
          <button type="submit" name="redo" value="step_ingredients" className="link-button" disabled={pending}>
            Zutaten pro Schritt neu zuordnen
          </button>
        )}
      </form>
      <p className="hint">Wird direkt gespeichert. Noch nicht gespeicherte Änderungen im Formular unten gehen dabei verloren.</p>
    </section>
  );
}
