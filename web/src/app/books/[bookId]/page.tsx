import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, getBookForUser } from "@/lib/books";
import { imageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ bookId: string }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { bookId } = await props.params;
  const access = await getBookForUser(bookId);
  return { title: access?.book.name ?? "Rezeptbuch" };
}

export default async function BookPage(props: Props) {
  const { bookId } = await props.params;
  const { q } = await props.searchParams;
  const access = await getBookForUser(bookId);
  if (!access) notFound();
  const { book, role } = access;

  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select("id, title, tags, status, visibility, image_path")
    .eq("book_id", book.id)
    .order("created_at", { ascending: false });
  const search = q?.trim();
  if (search) query = query.ilike("title", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const { data: recipes } = await query;

  return (
    <>
      <h1>{book.name}</h1>
      <div className="row">
        {canEdit(role) && (
          <Link href={`/books/${book.id}/new`} className="button">
            Rezept hinzufügen
          </Link>
        )}
        <Link href={`/books/${book.id}/settings`}>{role === "owner" ? "Teilen & Einstellungen" : "Mitglieder"}</Link>
      </div>

      <form className="row" style={{ marginTop: "1.5rem" }}>
        <input type="search" name="q" defaultValue={search} placeholder="Rezepte durchsuchen" style={{ flex: "1 1 12rem" }} />
        <button type="submit" className="secondary">
          Suchen
        </button>
      </form>

      {!recipes || recipes.length === 0 ? (
        <p className="empty">{search ? "Keine Rezepte gefunden." : "Noch keine Rezepte in diesem Buch."}</p>
      ) : (
        <ul className="recipe-grid">
          {recipes.map((r) => {
            const src = imageUrl(r.image_path);
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
                  {(r.status === "incomplete" || r.visibility === "public") && (
                    <span>
                      {r.status === "incomplete" && <span className="badge">unvollständig</span>}
                      {r.visibility === "public" && <span className="badge">öffentlich</span>}
                    </span>
                  )}
                  {r.tags?.length > 0 && <span className="list-tags">{r.tags.join(" · ")}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
