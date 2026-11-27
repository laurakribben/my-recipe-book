import Link from "next/link";
import type { Book } from "@/lib/books";
import { ROLE_LABELS, type BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";
import { createBook } from "./books/actions";

export default async function HomePage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const user = await getUser();

  if (!user) {
    return (
      <>
        <h1>Mein Rezeptbuch</h1>
        <p>
          Rezepte aus Instagram, Websites, Videos und Fotos sammeln – die KI macht daraus ein sauberes Rezept auf
          Deutsch. Rezeptbücher lassen sich mit anderen teilen.
        </p>
        <p>
          <Link href="/login" className="button">
            Anmelden
          </Link>
        </p>
        <p className="muted small">Die Nutzung ist nur auf Einladung möglich.</p>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("book_members")
    .select("role, books (id, name, owner_id, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const books = (data ?? [])
    .filter((m) => m.books)
    .map((m) => ({ ...(m.books as unknown as Book), role: m.role as BookRole }));

  return (
    <>
      <h1>Meine Rezeptbücher</h1>
      {error && <p className="notice error">{error}</p>}
      {books.length === 0 ? (
        <p className="empty">Du hast noch kein Rezeptbuch. Lege unten dein erstes an.</p>
      ) : (
        <ul className="plain-list">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`}>{b.name}</Link>
              {b.role !== "owner" && <span className="list-tags">Geteilt mit dir · {ROLE_LABELS[b.role]}</span>}
            </li>
          ))}
        </ul>
      )}

      <h2>Neues Rezeptbuch</h2>
      <form action={createBook} className="row">
        <input type="text" name="name" required maxLength={100} placeholder="z. B. Backen" style={{ flex: "1 1 14rem" }} />
        <button type="submit">Anlegen</button>
      </form>
    </>
  );
}
