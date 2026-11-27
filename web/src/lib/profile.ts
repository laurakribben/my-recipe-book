import "server-only";
import { cache } from "react";
import { createClient, getUser } from "@/lib/supabase/server";

/** The logged-in user's profile, or null when logged out. */
export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const email = data?.email ?? user.email ?? "";
  return {
    id: user.id,
    email,
    displayName: (data?.display_name as string | null) ?? null,
    /** What to show: the chosen name, otherwise the part of the email before the "@". */
    shownName: (data?.display_name as string | null)?.trim() || email.split("@")[0] || "Konto",
  };
});
