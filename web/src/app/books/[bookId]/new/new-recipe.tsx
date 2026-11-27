"use client";

import { useActionState, useState } from "react";
import { RecipeForm } from "@/components/recipe-form";
import { EMPTY_DRAFT, type RecipeDraft } from "@/lib/recipe";
import { shrinkImage } from "@/lib/shrink-image";
import type { ExtractState, SaveState } from "@/app/recipes/actions";

type Mode = "link" | "text" | "images" | "manual";

const MODES: { id: Mode; label: string }[] = [
  { id: "link", label: "Link" },
  { id: "text", label: "Text" },
  { id: "images", label: "Fotos" },
  { id: "manual", label: "Von Hand" },
];

type Props = {
  extract: (prev: ExtractState, formData: FormData) => Promise<ExtractState>;
  save: (prev: SaveState, formData: FormData) => Promise<SaveState>;
};

export function NewRecipe({ extract, save }: Props) {
  const [mode, setMode] = useState<Mode>("link");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [state, extractAction, pending] = useActionState(async (prev: ExtractState, formData: FormData) => {
    if (formData.get("mode") === "images") {
      const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
      formData.delete("images");
      for (const file of files) formData.append("images", await shrinkImage(file));
    }
    const result = await extract(prev, formData);
    if (result?.ok) setDraft(result.draft);
    return result;
  }, null);

  if (draft) {
    return (
      <>
        <p className="notice warning">
          Bitte prüfe das Rezept kurz – die KI kann sich irren. Erst mit „Speichern“ landet es im Buch.
        </p>
        <RecipeForm draft={draft} action={save} submitLabel="Speichern" />
        <p>
          <button type="button" className="link-button" onClick={() => setDraft(null)}>
            Verwerfen und neu beginnen
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="tabs" role="group" aria-label="Quelle">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          Leeres Rezept öffnen
        </button>
      ) : (
        <form action={extractAction}>
          <input type="hidden" name="mode" value={mode} />

          {mode === "link" && (
            <label className="field">
              <span>Link zum Rezept</span>
              <input type="url" name="url" required placeholder="https://…" />
              <span className="hint">
                Rezept-Websites und YouTube. Für Instagram und TikTok bitte „Text“ oder „Fotos“ nutzen – diese Seiten
                lassen sich ohne Anmeldung nicht lesen.
              </span>
            </label>
          )}

          {mode === "text" && (
            <>
              <label className="field">
                <span>Rezepttext</span>
                <textarea name="text" required rows={12} placeholder="z. B. die Beschreibung eines Instagram-Posts" />
              </label>
              <label className="field">
                <span>Link zur Quelle (optional)</span>
                <input type="url" name="source_url" placeholder="https://www.instagram.com/…" />
              </label>
            </>
          )}

          {mode === "images" && (
            <>
              <label className="field">
                <span>Fotos oder Screenshots (bis zu 6)</span>
                <input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/gif" multiple required />
                <span className="hint">Kochbuchseiten, Rezeptkarten oder Screenshots von Beitrag, Beschreibung und Kommentaren.</span>
              </label>
              <label className="field">
                <span>Link zur Quelle (optional)</span>
                <input type="url" name="source_url" placeholder="https://www.instagram.com/…" />
              </label>
              <label className="field">
                <span>Hinweis für die KI (optional)</span>
                <input type="text" name="hint" maxLength={500} placeholder="z. B. Das Rezept steht im zweiten Bild" />
              </label>
            </>
          )}

          {state && !state.ok && <p className="notice error">{state.error}</p>}
          <button type="submit" disabled={pending}>
            {pending ? "KI liest das Rezept…" : "Rezept erkennen"}
          </button>
        </form>
      )}
    </>
  );
}
