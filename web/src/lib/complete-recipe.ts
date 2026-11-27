import "server-only";
import { recordAiUsage } from "@/lib/ai-usage";
import { ExtractionError } from "@/lib/extract";
import { FetchPageError } from "@/lib/fetch-page";
import { deleteRecipeImages } from "@/lib/image-storage";
import type { Recipe } from "@/lib/recipe";
import { COMPLETERS, CompletionError } from "@/lib/recipe-completion";
import { createClient } from "@/lib/supabase/server";

export type CompletionResult = { done: string[]; failed: string[] } | { error: string };

/** The checks that would run for this recipe (missing, or `redo`, and not blocked). */
export function runnableCompleters(recipe: Recipe, redo = "") {
  return COMPLETERS.filter((c) => (c.id === redo || c.isMissing(recipe)) && !c.blockedReason(recipe));
}

/**
 * Fills in what the recipe is missing and saves it. Permission must be checked by the caller.
 * `budget.left` is the user's remaining AI calls for completing; it is shared between recipes
 * completed at the same time and is reserved before each call.
 */
export async function completeRecipe(
  userId: string,
  recipe: Recipe,
  budget: { left: number },
  redo = "",
): Promise<CompletionResult> {
  const done: string[] = [];
  const failed: string[] = [];
  let update: Partial<Recipe> = {};

  for (const c of runnableCompleters(recipe, redo)) {
    if (c.usesAi) {
      if (budget.left <= 0) {
        failed.push(`${c.label}: Tageslimit für KI erreicht`);
        continue;
      }
      budget.left--;
    }
    try {
      const result = await c.run(recipe);
      update = { ...update, ...result.update };
      if (result.usage) await recordAiUsage(userId, "complete", result.usage);
      done.push(c.label);
    } catch (error) {
      console.error(`Completing "${c.id}" failed`, error instanceof Error ? error.message : error);
      if (error instanceof CompletionError && error.usage) await recordAiUsage(userId, "complete", error.usage);
      const userMessage =
        error instanceof FetchPageError || error instanceof ExtractionError || error instanceof CompletionError;
      failed.push(userMessage ? `${c.label}: ${error.message}` : c.label);
    }
  }

  if (Object.keys(update).length > 0) {
    const supabase = await createClient();
    const { error } = await supabase.from("recipes").update(update).eq("id", recipe.id);
    if (error) {
      if (update.image_path) await deleteRecipeImages([update.image_path]);
      return { error: "Speichern hat nicht geklappt." };
    }
    if (update.image_path && recipe.image_path) await deleteRecipeImages([recipe.image_path]);
  }
  return { done, failed };
}
