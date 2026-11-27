"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";

export type NameState = { ok?: boolean; error?: string } | null;

const DisplayName = z.string().trim().max(80, "Höchstens 80 Zeichen.");

/** Saves the name shown in the header and in member lists. Empty = use the email. */
export async function updateDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  const user = await getUser();
  if (!user) return { error: "Bitte melde dich an." };
  const name = DisplayName.safeParse(formData.get("display_name") ?? "");
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Ungültiger Name." };

  // RLS: users can only update their own profile.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.data || null })
    .eq("id", user.id);
  if (error) {
    console.error("Updating the display name failed", { code: error.code, message: error.message });
    return { error: "Speichern hat nicht geklappt." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
