import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, getBookForUser } from "@/lib/books";
import { imageUrl } from "@/lib/images";
import { SOURCE_TYPE_LABELS, siteName } from "@/lib/recipe";
import { loadRecipe } from "@/lib/recipes";
import { AddToPlan } from "@/components/add-to-plan";
import { RecordRecentView } from "@/components/recent";
import { SettingsIcon } from "@/components/icons";
import { ShareRecipe } from "@/components/share-recipe";
import { setRecipeVisibility } from "../actions";
import { formatDay, getMyPlans, isIsoDate, today } from "@/lib/plans";
import { getUser } from "@/lib/supabase/server";
import { parseServings } from "@/lib/servings";
import { RecipeIngredients } from "@/components/servings";

type Props = {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ portionen?: string; geplant?: string; gemerkt?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { recipeId } = await props.params;
  const recipe = await loadRecipe(recipeId);
  return { title: recipe?.title ?? "Rezept" };
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function RecipePage(props: Props) {
  const { recipeId } = await props.params;
  const { portionen, geplant, gemerkt } = await props.searchParams;
  const recipe = await loadRecipe(recipeId);
  if (!recipe) notFound();
  const access = await getBookForUser(recipe.book_id);
  const user = await getUser();
  const plans = user ? (await getMyPlans(user.id)).filter((p) => canEdit(p.role)) : [];
  const base = parseServings(recipe.servings);
  const plannedServings = Number(portionen);

  return (
    <article>
      <RecordRecentView id={recipe.id} title={recipe.title} />
      {access && (
        <p className="small">
          <Link href={`/books/${access.book.id}`}>← {access.book.name}</Link>
        </p>
      )}
      <div className="title-row">
        <h1>{recipe.title}</h1>
        <div className="title-actions">
          <ShareRecipe
            title={recipe.title}
            visibility={recipe.visibility}
            bookName={access?.book.name ?? null}
            setVisibility={access && canEdit(access.role) ? setRecipeVisibility.bind(null, recipe.id) : undefined}
          />
          {access && canEdit(access.role) && (
            <Link href={`/recipes/${recipe.id}/edit`} className="button secondary icon-button" aria-label="Einstellungen" title="Einstellungen">
              <SettingsIcon />
            </Link>
          )}
        </div>
      </div>

      {imageUrl(recipe.image_path) && (
        <div className="recipe-hero">
          <Image src={imageUrl(recipe.image_path)!} alt={recipe.title} fill priority sizes="(max-width: 720px) 100vw, 680px" />
        </div>
      )}
      {imageUrl(recipe.image_path) && (recipe.image_credit || recipe.image_source_url) && (
        <p className="image-credit">
          Bild:{" "}
          {recipe.image_source_url ? (
            <a href={recipe.image_source_url} rel="noopener noreferrer nofollow" target="_blank">
              {recipe.image_credit || siteName(recipe.image_source_url)}
            </a>
          ) : (
            recipe.image_credit
          )}
        </p>
      )}

      {(gemerkt === "this" || gemerkt === "next") && (
        <p className="notice success">
          Vorgemerkt für „{gemerkt === "this" ? "Diese Woche" : "Nächste Woche"}“.{" "}
          <Link href="/plans#ideen">Zum Wochenplan</Link>
        </p>
      )}
      {isIsoDate(geplant) && (
        <p className="notice success">
          Eingeplant für {formatDay(geplant)}. <Link href={`/plans?woche=${geplant}`}>Zum Wochenplan</Link>
        </p>
      )}
      <div className="toolbar">
        <Link href={`/recipes/${recipe.id}/cook`} className="button">
          Kochmodus
        </Link>
      </div>
      {user && (
        <AddToPlan
          recipeId={recipe.id}
          plans={plans.map((p) => ({ id: p.id, name: p.name }))}
          defaultDay={today()}
          defaultServings={base}
        />
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

      {/* Wide screens: ingredients on the left (staying in view), steps on the right. */}
      <div className="recipe-body">
        <section className="recipe-ingredients">
          <h2>Zutaten</h2>
          <RecipeIngredients
            recipeId={recipe.id}
            base={base}
            ingredients={recipe.ingredients}
            initialServings={plannedServings > 0 && plannedServings <= 100 ? plannedServings : null}
          />
        </section>
        <section className="recipe-steps">
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
        </section>
      </div>

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
