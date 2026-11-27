import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { imageUrl } from "@/lib/images";
import type { Recipe } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Suche" };

/** Escapes LIKE wildcards, so "50%" searches for the text "50%". */
function likeEscape(word: string) {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Which ingredient or tag matched, to show why a recipe was found. */
function matchHint(recipe: Recipe, words: string[]): string | null {
  const lower = words.map((w) => w.toLowerCase());
  if (lower.every((w) => recipe.title.toLowerCase().includes(w))) return null;
  const items = recipe.ingredients.flatMap((g) => g.items);
  const hits = items.filter((i) => lower.some((w) => i.toLowerCase().includes(w)));
  if (hits.length) return `Zutaten: ${hits.slice(0, 3).join(" · ")}`;
  const tags = recipe.tags.filter((t) => lower.some((w) => t.toLowerCase().includes(w)));
  return tags.length ? `Schlagwörter: ${tags.join(", ")}` : null;
}

export default async function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { q = "" } = await props.searchParams;
  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 6)
    .map((w) => w.slice(0, 50));

  let recipes: Recipe[] = [];
  let books = new Map<string, string>();
  let failed = false;
  if (words.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_recipes", { words: words.map(likeEscape) });
    if (error) {
      console.error("Search failed", { code: error.code, message: error.message });
      failed = true;
    }
    recipes = (data ?? []) as Recipe[];
    const ids = [...new Set(recipes.map((r) => r.book_id))];
    if (ids.length) {
      const { data: bookRows } = await supabase.from("books").select("id, name").in("id", ids);
      books = new Map((bookRows ?? []).map((b) => [b.id, b.name]));
    }
  }

  return (
    <>
      <h1>Suche</h1>
      <form className="row" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rezept, Zutat oder Schlagwort"
          autoFocus={!q}
          aria-label="Suchbegriff"
          style={{ flex: "1 1 14rem" }}
        />
        <button type="submit">Suchen</button>
      </form>
      <p className="hint">Sucht in allen deinen Rezeptbüchern – in Titeln, Zutaten und Schlagwörtern.</p>

      {failed && <p className="notice error">Die Suche hat nicht geklappt. Bitte später nochmal versuchen.</p>}
      {words.length > 0 && !failed && recipes.length === 0 && (
        <div className="card">
          <p style={{ marginTop: 0 }}>Nichts gefunden für „{q}“.</p>
          <p className="hint">Tipp: weniger oder kürzere Wörter versuchen, z. B. „Zucchini“ statt „Zucchinipuffer“.</p>
        </div>
      )}
      {recipes.length > 0 && (
        <>
          <p className="muted small">
            {recipes.length} {recipes.length === 1 ? "Rezept" : "Rezepte"} gefunden
          </p>
          <ul className="recipe-grid">
            {recipes.map((r) => {
              const src = imageUrl(r.image_path);
              const hint = matchHint(r, words);
              return (
                <li key={r.id}>
                  <Link href={`/recipes/${r.id}`} className="recipe-card">
                    <div className="recipe-card-image">
                      {src ? (
                        <Image src={src} alt="" fill sizes="(max-width: 640px) 50vw, 230px" />
                      ) : (
                        <span aria-hidden="true">{r.title.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="recipe-card-title">{r.title}</span>
                    <span className="list-tags">{books.get(r.book_id)}</span>
                    {hint && <span className="list-tags">{hint}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
