"use client";

import { useActionState, useState } from "react";
import { ingredientsToText, SOURCE_TYPE_LABELS, SOURCE_TYPES, type RecipeDraft } from "@/lib/recipe";
import type { SaveState } from "@/app/recipes/actions";

type Props = {
  draft: RecipeDraft;
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  submitLabel: string;
};

/** Edit form for all recipe fields. Ingredients and steps are edited as text, one per line. */
export function RecipeForm({ draft, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [incomplete, setIncomplete] = useState(draft.status === "incomplete");

  return (
    <form action={formAction}>
      <label className="field">
        <span>Titel</span>
        <input type="text" name="title" defaultValue={draft.title} required maxLength={200} />
      </label>

      <label className="field">
        <span>Zutaten</span>
        <textarea name="ingredients" defaultValue={ingredientsToText(draft.ingredients)} rows={10} />
        <span className="hint">Eine Zutat pro Zeile. Zwischenüberschriften mit # davor, z. B. „# Teig“.</span>
      </label>

      <label className="field">
        <span>Zubereitung</span>
        <textarea name="steps" defaultValue={draft.steps.join("\n")} rows={10} />
        <span className="hint">Ein Schritt pro Zeile.</span>
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Portionen</span>
          <input type="text" name="servings" defaultValue={draft.servings} maxLength={50} />
        </label>
        <label className="field">
          <span>Vorbereitung</span>
          <input type="text" name="prep_time" defaultValue={draft.prep_time} maxLength={50} placeholder="z. B. 15 Min." />
        </label>
        <label className="field">
          <span>Back-/Kochzeit</span>
          <input type="text" name="cook_time" defaultValue={draft.cook_time} maxLength={50} />
        </label>
        <label className="field">
          <span>Gesamt</span>
          <input type="text" name="total_time" defaultValue={draft.total_time} maxLength={50} />
        </label>
      </div>

      <label className="field">
        <span>Schlagwörter</span>
        <input type="text" name="tags" defaultValue={draft.tags.join(", ")} placeholder="z. B. Kuchen, Herbst" />
        <span className="hint">Durch Kommas getrennt.</span>
      </label>

      <label className="field">
        <span>Notizen</span>
        <textarea name="notes" defaultValue={draft.notes} rows={4} />
      </label>

      <fieldset className="field card">
        <legend>Quelle</legend>
        <label className="field">
          <span>Link</span>
          <input type="url" name="source_url" defaultValue={draft.source_url} placeholder="https://…" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Art</span>
            <select name="source_type" defaultValue={draft.source_type}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Autor:in</span>
            <input type="text" name="source_author" defaultValue={draft.source_author} maxLength={200} />
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label className="row">
          <input type="checkbox" name="incomplete" checked={incomplete} onChange={(e) => setIncomplete(e.target.checked)} />
          Rezept ist unvollständig
        </label>
        {incomplete && (
          <label className="field" style={{ marginTop: "0.5rem" }}>
            <span>Was fehlt?</span>
            <textarea name="missing" defaultValue={draft.missing} rows={3} />
          </label>
        )}
      </div>

      <label className="field">
        <span>Sichtbarkeit</span>
        <select name="visibility" defaultValue={draft.visibility}>
          <option value="private">Privat – nur Mitglieder dieses Buchs</option>
          <option value="public">Öffentlich – alle mit dem Link</option>
        </select>
      </label>

      {state?.error && <p className="notice error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Wird gespeichert…" : submitLabel}
      </button>
    </form>
  );
}
