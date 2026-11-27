import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Recipe books and meal plans are shared the same way; only the table names differ. */
export const SHARED_KINDS = {
  book: { members: "book_members", invites: "book_invites", idColumn: "book_id" },
  plan: { members: "meal_plan_members", invites: "meal_plan_invites", idColumn: "plan_id" },
} as const;
export type SharedKind = keyof typeof SHARED_KINDS;

/**
 * Shares a book or plan with an email address: existing users are added right away,
 * new people get an invitation email and are added when their account is created.
 * Only call this after checking that the current user owns the book or plan: the
 * admin client bypasses the access rules. Returns a message for the user.
 */
export async function shareWithEmail(
  kind: SharedKind,
  resourceId: string,
  email: string,
  role: "editor" | "viewer",
  invitedBy: string,
): Promise<{ ok: boolean; message: string }> {
  const t = SHARED_KINDS[kind];
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();

  if (existing) {
    const { error } = await admin
      .from(t.members)
      .upsert({ [t.idColumn]: resourceId, user_id: existing.id, role }, { onConflict: `${t.idColumn},user_id` });
    return error ? { ok: false, message: "Teilen hat nicht geklappt." } : { ok: true, message: `Geteilt mit ${email}.` };
  }

  const { error: inviteRowError } = await admin
    .from(t.invites)
    .upsert({ [t.idColumn]: resourceId, email, role, invited_by: invitedBy }, { onConflict: `${t.idColumn},email` });
  if (inviteRowError) return { ok: false, message: "Die Einladung konnte nicht gespeichert werden." };

  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${env.siteUrl()}/` });
  if (mailError) {
    await admin.from(t.invites).delete().eq(t.idColumn, resourceId).eq("email", email);
    return { ok: false, message: "Die Einladungs-E-Mail konnte nicht gesendet werden." };
  }
  return { ok: true, message: `Einladung an ${email} gesendet.` };
}
