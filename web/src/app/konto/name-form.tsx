"use client";

import { useActionState } from "react";
import { updateDisplayName, type NameState } from "./actions";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<NameState, FormData>(updateDisplayName, null);
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>Name</span>
        <input type="text" name="display_name" defaultValue={current} maxLength={80} autoComplete="name" />
        <span className="hint">
          Wird oben rechts und in den Mitgliederlisten geteilter Rezeptbücher und Wochenpläne angezeigt. Leer lassen, um
          deine E-Mail-Adresse zu verwenden.
        </span>
      </label>
      {state?.error && <p className="notice error">{state.error}</p>}
      {state?.ok && <p className="notice success">Name gespeichert.</p>}
      <div>
        <button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
