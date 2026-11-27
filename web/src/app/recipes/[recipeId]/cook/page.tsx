import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadRecipe } from "@/lib/recipes";
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

  return (
    <CookingMode
      recipeId={recipe.id}
      title={recipe.title}
      ingredients={recipe.ingredients}
      steps={recipe.steps}
    />
  );
}
