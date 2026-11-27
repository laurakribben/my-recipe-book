"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiCallsLeft } from "@/lib/ai-usage";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { completeRecipe, runnableCompleters } from "@/lib/complete-recipe";
import { deleteRecipeImages } from "@/lib/image-storage";
import type { Recipe } from "@/lib/recipe";
import { shareWithEmail } from "@/lib/sharing";
import { createClient, getUser } from "@/lib/supabase/server";

const BookName = z.string().trim().min(1).max(100);
const ShareRole = z.enum(["editor", "viewer"]);

function settingsUrl(bookId: string, msg: string, kind: "ok" | "error" = "ok") {
  return `/books/${bookId}/settings?${kind}=${encodeURIComponent(msg)}`;
}

/** Loads the book and makes sure the current user owns it. */
async function requireOwner(bookId: string) {
  const access = await getBookForUser(bookId);
  if (!access || access.role !== "owner") redirect("/");
  return access;
}

export async function createBook(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const name = BookName.safeParse(formData.get("name"));
  if (!name.success) redirect(`/?error=${encodeURIComponent("Bitte einen Namen angeben (höchstens 100 Zeichen).")}`);

  // The id is created here and the row is not read back: reading it back in the same
  // request fails the "members can see" rule, because the owner membership is only
  // added by a trigger after the insert.
  const id = crypto.randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("books").insert({ id, name: name.data, owner_id: user.id });
  if (error) {
    console.error("Creating a book failed", { code: error.code, message: error.message, details: error.details });
    // 23503: no profile row for this user (account created before the database setup ran).
    const reason =
      error.code === "23503"
        ? "Zu deinem Konto fehlt das Profil. Siehe web/README.md, Abschnitt „Fehlerbehebung“."
        : `Datenbankfehler ${error.code ?? ""}`.trim();
    redirect(`/?error=${encodeURIComponent(`Das Rezeptbuch konnte nicht angelegt werden (${reason}).`)}`);
  }
  redirect(`/books/${id}`);
}

export async function renameBook(bookId: string, formData: FormData) {
  await requireOwner(bookId);
  const name = BookName.safeParse(formData.get("name"));
  if (!name.success) redirect(settingsUrl(bookId, "Bitte einen Namen angeben.", "error"));

  const supabase = await createClient();
  await supabase.from("books").update({ name: name.data }).eq("id", bookId);
  revalidatePath(`/books/${bookId}`, "layout");
  redirect(settingsUrl(bookId, "Name gespeichert."));
}

export async function deleteBook(bookId: string, formData: FormData) {
  const { book } = await requireOwner(bookId);
  if (String(formData.get("confirm") ?? "").trim() !== book.name) {
    redirect(settingsUrl(bookId, "Zum Löschen bitte den Namen des Buchs genau eintippen.", "error"));
  }
  const supabase = await createClient();
  const { data: recipes } = await supabase.from("recipes").select("image_path").eq("book_id", bookId);
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (!error) await deleteRecipeImages((recipes ?? []).map((r) => r.image_path));
  redirect("/");
}

/**
 * Shares a book with an email address. Existing users are added right away;
 * new people get an invitation email and are added when their account is created.
 */
export async function shareBook(bookId: string, formData: FormData) {
  const { user } = await requireOwner(bookId);
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const role = ShareRole.safeParse(formData.get("role"));
  if (!email.success || !role.success) {
    redirect(settingsUrl(bookId, "Bitte eine gültige E-Mail-Adresse angeben.", "error"));
  }
  if (email.data === user.email?.toLowerCase()) {
    redirect(settingsUrl(bookId, "Du bist schon Eigentümer:in dieses Buchs.", "error"));
  }

  const result = await shareWithEmail("book", bookId, email.data, role.data, user.id);
  revalidatePath(`/books/${bookId}/settings`);
  redirect(settingsUrl(bookId, result.message, result.ok ? "ok" : "error"));
}

export async function changeMemberRole(bookId: string, userId: string, formData: FormData) {
  await requireOwner(bookId);
  const role = ShareRole.safeParse(formData.get("role"));
  if (!role.success || !isUuid(userId)) redirect(settingsUrl(bookId, "Ungültige Rolle.", "error"));

  const supabase = await createClient();
  await supabase.from("book_members").update({ role: role.data }).eq("book_id", bookId).eq("user_id", userId);
  redirect(settingsUrl(bookId, "Rolle geändert."));
}

export async function removeMember(bookId: string, userId: string) {
  await requireOwner(bookId);
  if (!isUuid(userId)) redirect(settingsUrl(bookId, "Ungültige Person.", "error"));
  const supabase = await createClient();
  await supabase.from("book_members").delete().eq("book_id", bookId).eq("user_id", userId);
  redirect(settingsUrl(bookId, "Zugriff entfernt."));
}

export async function withdrawInvite(bookId: string, inviteId: string) {
  await requireOwner(bookId);
  if (!isUuid(inviteId)) redirect(settingsUrl(bookId, "Ungültige Einladung.", "error"));
  const supabase = await createClient();
  await supabase.from("book_invites").delete().eq("id", inviteId).eq("book_id", bookId);
  redirect(settingsUrl(bookId, "Einladung zurückgezogen."));
}

export async function leaveBook(bookId: string) {
  const access = await getBookForUser(bookId);
  if (!access || access.role === "owner") redirect("/");
  const supabase = await createClient();
  await supabase.from("book_members").delete().eq("book_id", bookId).eq("user_id", access.user.id);
  redirect("/");
}

// ---------------------------------------------------------------- fill in all recipes

export type BatchResult =
  | {
      /** Recipes handled in this batch and what didn't work for them. */
      processed: { title: string; failed: string[] }[];
      /** Pass back for the next batch; null when every recipe has been handled. */
      next: string | null;
      limitReached: boolean;
    }
  | { error: string };

/** Recipes per call: they run at the same time, so one call stays well under a minute. */
const BATCH_SIZE = 3;

/**
 * "Fehlendes in allen Rezepten ergänzen" in the book settings: completes the next few recipes
 * (ordered by id, after `after`) that are missing something the app can fill in. The page
 * calls this again with `next` until it is null, so progress is shown and can be stopped.
 */
export async function completeBookBatch(bookId: string, after: string | null): Promise<BatchResult> {
  if (!isUuid(bookId) || (after !== null && !isUuid(after))) return { error: "Unbekanntes Rezeptbuch." };
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { error: "Du darfst in diesem Buch keine Rezepte bearbeiten." };

  const supabase = await createClient();
  let query = supabase.from("recipes").select("*").eq("book_id", bookId).order("id");
  if (after) query = query.gt("id", after);
  const { data, error } = await query;
  if (error) return { error: "Die Rezepte konnten nicht geladen werden." };

  const candidates = ((data ?? []) as Recipe[]).filter((r) => runnableCompleters(r).length > 0);
  const batch = candidates.slice(0, BATCH_SIZE);
  const budget = { left: await aiCallsLeft(access.user.id, "complete") };

  const results = await Promise.all(batch.map((r) => completeRecipe(access.user.id, r, budget)));
  const processed = batch.map((r, i) => {
    const result = results[i];
    return { title: r.title, failed: "error" in result ? [result.error] : result.failed };
  });

  for (const r of batch) revalidatePath(`/recipes/${r.id}`, "layout");
  revalidatePath(`/books/${bookId}`);
  const more = candidates.length > batch.length;
  // Out of AI calls with recipes left: stop instead of running into the limit for each of them.
  const limitReached = more && budget.left <= 0;
  return { processed, next: more && !limitReached ? batch[batch.length - 1].id : null, limitReached };
}
