import "server-only";
import { fetchImage, fetchPage, isLoginWalled } from "@/lib/fetch-page";
import { storeRecipeImage } from "@/lib/image-storage";
import { isImageType } from "@/lib/images";
import { isStepIngredients, siteName, type Recipe } from "@/lib/recipe";
import { readNutrition } from "@/lib/nutrition";
import { estimateNutrition } from "@/lib/nutrition-ai";
import { assignStepIngredients } from "@/lib/step-ingredients";

/** A failure with a message meant for the user (German). */
export class CompletionError extends Error {}

/**
 * Things a recipe can be missing that the app can fill in by itself ("Fehlendes ergänzen"
 * in the edit view). To support a new feature, add one entry to COMPLETERS.
 */
export type Completer = {
  id: string;
  /** Shown in the edit view, e.g. "Bild". */
  label: string;
  /** True if the recipe lacks this. */
  isMissing: (r: Recipe) => boolean;
  /** Why it can't be filled in automatically for this recipe, or null if it can. */
  blockedReason: (r: Recipe) => string | null;
  /** True if this uses the AI (counts towards the daily limit). */
  usesAi: boolean;
  /** Fills it in and returns the columns to update. */
  run: (r: Recipe) => Promise<{ update: Partial<Recipe>; usage?: { input_tokens: number; output_tokens: number } }>;
};

export const COMPLETERS: Completer[] = [
  {
    id: "image",
    label: "Bild",
    usesAi: false,
    isMissing: (r) => !r.image_path,
    blockedReason: (r) => {
      if (!r.source_url) return "Keine Quelle eingetragen – lade ein Bild hoch.";
      if (isLoginWalled(r.source_url)) return "Die Quelle erfordert eine Anmeldung – lade ein Bild hoch.";
      return null;
    },
    run: async (r) => {
      const page = await fetchPage(r.source_url!);
      if (!page.imageUrl) throw new CompletionError("Auf der Quellseite wurde kein Bild gefunden.");
      const { bytes, type } = await fetchImage(page.imageUrl);
      if (!isImageType(type)) throw new CompletionError("Das Bild der Quellseite hat ein unbekanntes Format.");
      const path = await storeRecipeImage(r.book_id, r.id, bytes, type);
      return {
        update: {
          image_path: path,
          image_credit: r.source_author || siteName(page.url),
          image_source_url: page.url,
        },
      };
    },
  },
  {
    id: "step_ingredients",
    label: "Zutaten pro Schritt (Kochmodus)",
    usesAi: true,
    isMissing: (r) => r.steps.length > 0 && !isStepIngredients(r.step_ingredients, r.steps.length),
    blockedReason: (r) => (r.ingredients.length === 0 ? "Es sind keine Zutaten eingetragen." : null),
    run: async (r) => {
      const { lists, usage } = await assignStepIngredients(r.ingredients, r.steps);
      return { update: { step_ingredients: lists }, usage };
    },
  },
  {
    id: "nutrition",
    label: "Nährwerte",
    usesAi: true,
    isMissing: (r) => !readNutrition(r.nutrition),
    blockedReason: (r) => (r.ingredients.length === 0 ? "Es sind keine Zutaten eingetragen." : null),
    run: async (r) => {
      const { nutrition, usage } = await estimateNutrition(r.title, r.ingredients, r.servings);
      if (!nutrition) throw new CompletionError("Die KI konnte die Nährwerte nicht schätzen.");
      return { update: { nutrition }, usage };
    },
  },
];

export type CompletionItem = { id: string; label: string; missing: boolean; blockedReason: string | null };

/** What the edit view shows: each check, whether it's missing, and whether it can be filled in. */
export function completionStatus(recipe: Recipe): CompletionItem[] {
  return COMPLETERS.map((c) => {
    const missing = c.isMissing(recipe);
    return { id: c.id, label: c.label, missing, blockedReason: missing ? c.blockedReason(recipe) : null };
  });
}
