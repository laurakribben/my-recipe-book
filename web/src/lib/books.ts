import "server-only";
import { cache } from "react";
import type { BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";

export type Book = { id: string; name: string; owner_id: string; created_at: string };

/** The book and the current user's role in it, or null if the user isn't a member. */
export const getBookForUser = cache(async (bookId: string) => {
  const user = await getUser();
  if (!user || !isUuid(bookId)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("book_members")
    .select("role, books (id, name, owner_id, created_at)")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.books) return null;
  return { book: data.books as unknown as Book, role: data.role as BookRole, user };
});

export function canEdit(role: BookRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
