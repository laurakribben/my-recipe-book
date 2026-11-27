import "server-only";
import { fetchImage, fetchPage, isLoginWalled } from "@/lib/fetch-page";
import { storeRecipeImage } from "@/lib/image-storage";
import { isImageType } from "@/lib/images";
import { isStepIngredients, siteName, type Recipe } from "@/lib/recipe";
import { readNutrition } from "@/lib/nutrition";
import { estimateNutrition } from "@/lib/nutrition-ai";
import { assignStepIngredients } from "@/lib/step-ingredients";
import { downloadFoundImage, findDishImage, ingredientHints } from "@/lib/image-search";

/** A failure with a message meant for the user (German); `usage` if the AI was asked anyway. */
export class CompletionError extends Error {
  constructor(
    message: string,
    readonly usage?: { input_tokens: number; output_tokens: number },
  ) {
    super(message);
  }
}

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
    usesAi: true,
    isMissing: (r) => !r.image_path,
    // Always possible: the picture of the source page, otherwise a free photo found by the AI.
    blockedReason: () => null,
    run: async (r) => {
      if (r.source_url && !isLoginWalled(r.source_url)) {
        try {
          const page = await fetchPage(r.source_url);
          if (page.imageUrl) {
            const { bytes, type } = await fetchImage(page.imageUrl);
            if (isImageType(type)) {
              const path = await storeRecipeImage(r.book_id, r.id, bytes, type);
              return {
                update: {
                  image_path: path,
                  image_credit: r.source_author || siteName(page.url),
                  image_source_url: page.url,
                },
              };
            }
          }
        } catch (error) {
          console.error("Source picture not available", error instanceof Error ? error.message : error);
        }
      }
      return findFreeImage(r);
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

/** A free photo of the dish (Openverse), stored for the recipe, with author and licence as credit. */
export async function findFreeImage(
  r: Pick<Recipe, "id" | "book_id" | "title" | "ingredients">,
): Promise<{ update: Partial<Recipe>; usage: { input_tokens: number; output_tokens: number } }> {
  const { image, usage } = await findDishImage(r.title, ingredientHints(r.ingredients));
  if (!image) throw new CompletionError("Kein passendes Bild mit freier Lizenz gefunden.", usage);
  const file = await downloadFoundImage(image);
  if (!file) throw new CompletionError("Das gefundene Bild ließ sich nicht laden.", usage);
  const path = await storeRecipeImage(r.book_id, r.id, file.bytes, file.type);
  return { update: { image_path: path, image_credit: image.credit, image_source_url: image.sourceUrl }, usage };
}
