import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { SOURCE_TYPE_LABELS, type Recipe } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ recipeId: string }> };

/** Loads a recipe the visitor may see: public ones for everyone, private ones for book members (RLS). */
const loadRecipe = cache(async (recipeId: string) => {
  if (!isUuid(recipeId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  return data as Recipe | null;
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { recipeId } = await props.params;
  const recipe = await loadRecipe(recipeId);
  return { title: recipe?.title ?? "Rezept" };
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function RecipePage(props: Props) {
  const { recipeId } = await props.params;
  const recipe = await loadRecipe(recipeId);
  if (!recipe) notFound();
  const access = await getBookForUser(recipe.book_id);

  return (
    <article>
      {access && (
        <p className="small">
          <Link href={`/books/${access.book.id}`}>← {access.book.name}</Link>
        </p>
      )}
      <h1>{recipe.title}</h1>

      {access && (
        <div className="row small">
          <span className="badge">{recipe.visibility === "public" ? "öffentlich" : "privat"}</span>
          {canEdit(access.role) && <Link href={`/recipes/${recipe.id}/edit`}>Bearbeiten</Link>}
        </div>
      )}

      {recipe.status === "incomplete" && (
        <p className="notice warning">
          <strong>Unvollständig:</strong> {recipe.missing}
        </p>
      )}

      <ul className="meta">
        {recipe.servings && <li>{recipe.servings} Portionen</li>}
        {recipe.prep_time && <li>Vorbereitung {recipe.prep_time}</li>}
        {recipe.cook_time && <li>Back-/Kochzeit {recipe.cook_time}</li>}
        {recipe.total_time && <li>Gesamt {recipe.total_time}</li>}
      </ul>

      {recipe.tags.length > 0 && (
        <p className="tags">
          {recipe.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </p>
      )}

      <h2>Zutaten</h2>
      {recipe.ingredients.length === 0 && <p className="empty">Keine Zutaten eingetragen.</p>}
      {recipe.ingredients.map((group, i) => (
        <div key={i}>
          {group.name && <h3>{group.name}</h3>}
          <ul>
            {group.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Zubereitung</h2>
      {recipe.steps.length > 0 ? (
        <ol>
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="empty">Noch keine Zubereitungsschritte vorhanden. Siehe Originalbeitrag.</p>
      )}

      {recipe.notes && (
        <>
          <h2>Notizen</h2>
          <p className="notes">{recipe.notes}</p>
        </>
      )}

      <p className="source">
        {recipe.source_url ? (
          <>
            Quelle:{" "}
            <a href={recipe.source_url} rel="noopener noreferrer nofollow" target="_blank">
              {recipe.source_author || recipe.source_url}
            </a>{" "}
            ({SOURCE_TYPE_LABELS[recipe.source_type]}) ·{" "}
          </>
        ) : (
          recipe.source_author && <>Quelle: {recipe.source_author} · </>
        )}
        hinzugefügt am {dateFormat.format(new Date(recipe.created_at))}
      </p>
    </article>
  );
}
