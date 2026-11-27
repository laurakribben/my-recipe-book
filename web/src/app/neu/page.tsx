import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Book } from "@/lib/books";
import type { BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rezept hinzufügen" };

/** "Neu" tab: pick the recipe book for a new recipe (skipped if there is only one). */
export default async function NewRecipeShortcut() {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("book_members")
    .select("role, books (id, name, owner_id, created_at)")
    .eq("user_id", user.id)
    .order("created_at");
  const books = (data ?? [])
    .filter((m) => m.books && (m.role === "owner" || m.role === "editor"))
    .map((m) => ({ ...(m.books as unknown as Book), role: m.role as BookRole }));

  if (books.length === 1) redirect(`/books/${books[0].id}/new`);

  return (
    <>
      <h1>Rezept hinzufügen</h1>
      {books.length === 0 ? (
        <div className="card">
          <p>Lege zuerst ein Rezeptbuch an – dann kannst du Rezepte per Link, Text oder Foto hinzufügen.</p>
          <Link href="/" className="button">
            Rezeptbuch anlegen
          </Link>
        </div>
      ) : (
        <>
          <p>In welches Rezeptbuch?</p>
          <ul className="plain-list">
            {books.map((b) => (
              <li key={b.id}>
                <Link href={`/books/${b.id}/new`}>{b.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
