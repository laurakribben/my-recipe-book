"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBookForUser, isUuid } from "@/lib/books";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
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
  await supabase.from("books").delete().eq("id", bookId);
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

  // The admin client is needed to find accounts by email and to send invites.
  // The owner check above is what authorises this.
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email.data).maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("book_members")
      .upsert({ book_id: bookId, user_id: existing.id, role: role.data }, { onConflict: "book_id,user_id" });
    if (error) redirect(settingsUrl(bookId, "Teilen hat nicht geklappt.", "error"));
    revalidatePath(`/books/${bookId}/settings`);
    redirect(settingsUrl(bookId, `Geteilt mit ${email.data}.`));
  }

  const { error: inviteRowError } = await admin
    .from("book_invites")
    .upsert({ book_id: bookId, email: email.data, role: role.data, invited_by: user.id }, { onConflict: "book_id,email" });
  if (inviteRowError) redirect(settingsUrl(bookId, "Die Einladung konnte nicht gespeichert werden.", "error"));

  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email.data, {
    redirectTo: `${env.siteUrl()}/`,
  });
  if (mailError) {
    await admin.from("book_invites").delete().eq("book_id", bookId).eq("email", email.data);
    redirect(settingsUrl(bookId, "Die Einladungs-E-Mail konnte nicht gesendet werden.", "error"));
  }

  revalidatePath(`/books/${bookId}/settings`);
  redirect(settingsUrl(bookId, `Einladung an ${email.data} gesendet.`));
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
