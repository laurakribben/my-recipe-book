import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assignStepIngredientsAction } from "@/app/recipes/actions";
import { canEdit, getBookForUser } from "@/lib/books";
import { imageUrl } from "@/lib/images";
import { isStepIngredients } from "@/lib/recipe";
import { loadRecipe } from "@/lib/recipes";
import { parseServings } from "@/lib/servings";
import { CookingMode } from "./cooking-mode";

type Props = { params: Promise<{ recipeId: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { recipeId } = await props.params;
  const recipe = await loadRecipe(recipeId);
  return { title: recipe ? `Kochmodus: ${recipe.title}` : "Kochmodus" };
}

export default async function CookPage(props: Props) {
  const { recipeId } = await props.params;
  const recipe = await loadRecipe(recipeId);
  if (!recipe) notFound();
  const access = await getBookForUser(recipe.book_id);
  const stepIngredients = isStepIngredients(recipe.step_ingredients, recipe.steps.length) ? recipe.step_ingredients : null;

  return (
    <CookingMode
      recipeId={recipe.id}
      title={recipe.title}
      imageUrl={imageUrl(recipe.image_path)}
      ingredients={recipe.ingredients}
      servingsBase={parseServings(recipe.servings)}
      steps={recipe.steps}
      stepIngredients={stepIngredients}
      assign={
        !stepIngredients && canEdit(access?.role) ? assignStepIngredientsAction.bind(null, recipe.id) : undefined
      }
    />
  );
}
