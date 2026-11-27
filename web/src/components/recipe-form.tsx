"use client";

import { useActionState, useState } from "react";
import { ingredientsToText, SOURCE_TYPE_LABELS, SOURCE_TYPES, type RecipeDraft } from "@/lib/recipe";
import { shrinkImage } from "@/lib/shrink-image";
import type { SaveState } from "@/app/recipes/actions";

type Props = {
  draft: RecipeDraft;
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  submitLabel: string;
};

/** Edit form for all recipe fields. Ingredients and steps are edited as text, one per line. */
export function RecipeForm({ draft, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(async (prev: SaveState, formData: FormData) => {
    const file = formData.get("image");
    if (file instanceof File && file.size > 0) formData.set("image", await shrinkImage(file));
    return action(prev, formData);
  }, null);
  const [incomplete, setIncomplete] = useState(draft.status === "incomplete");

  return (
    <form action={formAction}>
      <label className="field">
        <span>Titel</span>
        <input type="text" name="title" defaultValue={draft.title} required maxLength={200} />
      </label>

      <ImageField currentUrl={draft.image_url} suggestedUrl={draft.suggested_image_url} />

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

/**
 * Picture of the recipe: shows the current (or suggested) picture and lets the user
 * upload a new one, keep the picture from the source website, or remove it.
 */
function ImageField({ currentUrl, suggestedUrl }: { currentUrl: string; suggestedUrl: string }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [useSuggested, setUseSuggested] = useState(Boolean(suggestedUrl));

  const preview = fileUrl ?? (currentUrl && !remove ? currentUrl : !currentUrl && useSuggested ? suggestedUrl : null);

  return (
    <div className="field">
      <span>Bild</span>
      {preview && (
        // A plain <img>: the preview can come from any website or from a local file.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="image-preview" />
      )}
      <input
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (fileUrl) URL.revokeObjectURL(fileUrl);
          setFileUrl(file ? URL.createObjectURL(file) : null);
        }}
      />
      {suggestedUrl && !currentUrl && !fileUrl && (
        <label className="row small" style={{ marginTop: "0.5rem" }}>
          <input type="checkbox" checked={useSuggested} onChange={(e) => setUseSuggested(e.target.checked)} />
          Bild von der Website übernehmen
        </label>
      )}
      {useSuggested && <input type="hidden" name="use_suggested_image" value="1" />}
      <input type="hidden" name="suggested_image_url" value={suggestedUrl} />
      {currentUrl && !fileUrl && (
        <label className="row small" style={{ marginTop: "0.5rem" }}>
          <input type="checkbox" name="remove_image" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
          Bild entfernen
        </label>
      )}
      <span className="hint">Ein neues Bild ersetzt das bisherige.</span>
    </div>
  );
}
