import "server-only";
import { cache } from "react";
import { isUuid } from "@/lib/books";
import type { Recipe } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";

/** A recipe the visitor may see: public ones for everyone, private ones for book members (RLS). */
export const loadRecipe = cache(async (recipeId: string): Promise<Recipe | null> => {
  if (!isUuid(recipeId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  return data as Recipe | null;
});
