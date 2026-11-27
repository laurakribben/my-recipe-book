import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/recipe-form";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { recipeToDraft, type Recipe } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";
import { completionStatus } from "@/lib/recipe-completion";
import { completeRecipeAction, deleteRecipe, updateRecipe } from "../../actions";
import { CompletionPanel } from "./completion-panel";

export const metadata: Metadata = { title: "Rezept bearbeiten" };

export default async function EditRecipePage(props: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await props.params;
  if (!isUuid(recipeId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  const recipe = data as Recipe | null;
  if (!recipe) notFound();
  const access = await getBookForUser(recipe.book_id);
  if (!access || !canEdit(access.role)) notFound();

  return (
    <>
      <p className="small">
        <Link href={`/recipes/${recipe.id}`}>← {recipe.title}</Link>
      </p>
      <h1>Rezept bearbeiten</h1>
      <CompletionPanel items={completionStatus(recipe)} complete={completeRecipeAction.bind(null, recipe.id)} />
      {/* key: start fresh with the saved values after "Fehlendes ergänzen" changed the recipe */}
      <RecipeForm
        key={recipe.updated_at}
        draft={recipeToDraft(recipe)}
        action={updateRecipe.bind(null, recipe.id)}
        submitLabel="Speichern"
      />

      <h2>Rezept löschen</h2>
      <form action={deleteRecipe.bind(null, recipe.id, recipe.book_id)}>
        <button type="submit" className="danger">
          Rezept löschen
        </button>
      </form>
    </>
  );
}
