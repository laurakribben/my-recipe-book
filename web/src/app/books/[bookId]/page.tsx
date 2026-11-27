import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, getBookForUser } from "@/lib/books";
import { PlusIcon, SettingsIcon, ShareIcon } from "@/components/icons";
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
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select("id, title, tags, status, visibility, image_path")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  const search = q?.trim();
  if (search) query = query.ilike("title", `%${search.replace(/[%_\\]/g, "\\$&")}%`);

  // Both at the same time; the access rules in the database only return recipes the user may see.
  const [access, { data: recipes }] = await Promise.all([getBookForUser(bookId), query]);
  if (!access) notFound();
  const { book, role } = access;

  return (
    <>
      <div className="title-row">
        <h1>{book.name}</h1>
        <div className="title-actions">
          <Link
            href={`/books/${book.id}/settings#teilen`}
            className="button secondary icon-button"
            aria-label={role === "owner" ? "Teilen" : "Mitglieder"}
            title={role === "owner" ? "Teilen" : "Mitglieder"}
          >
            <ShareIcon />
          </Link>
          {canEdit(role) && (
            <Link
              href={`/books/${book.id}/settings#einstellungen`}
              className="button secondary icon-button"
              aria-label="Einstellungen"
              title="Einstellungen"
            >
              <SettingsIcon />
            </Link>
          )}
          {canEdit(role) && (
            <Link
              href={`/books/${book.id}/new`}
              className="button icon-button"
              aria-label="Rezept hinzufügen"
              title="Rezept hinzufügen"
            >
              <PlusIcon />
            </Link>
          )}
        </div>
      </div>

      <form className="row" style={{ marginTop: "1rem" }}>
        <input type="search" name="q" defaultValue={search} placeholder="Rezepte durchsuchen" style={{ flex: "1 1 12rem" }} />
        <button type="submit" className="secondary">
          Suchen
        </button>
      </form>

      {!recipes || recipes.length === 0 ? (
        search ? (
          <p className="empty">
            Keine Rezepte gefunden. <Link href={`/suche?q=${encodeURIComponent(search)}`}>In allen Büchern suchen</Link>
          </p>
        ) : canEdit(role) ? (
          <div className="card empty-state">
            <p style={{ marginTop: 0 }}>
              <strong>Noch keine Rezepte in diesem Buch.</strong> Füge dein erstes hinzu – die KI liest es für dich ein:
            </p>
            <div className="toolbar">
              <Link href={`/books/${book.id}/new?quelle=link`} className="button">
                Per Link
              </Link>
              <Link href={`/books/${book.id}/new?quelle=fotos`} className="button secondary">
                Per Foto oder Screenshot
              </Link>
              <Link href={`/books/${book.id}/new?quelle=text`} className="button secondary">
                Text einfügen
              </Link>
            </div>
          </div>
        ) : (
          <p className="empty">In diesem Buch sind noch keine Rezepte.</p>
        )
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
