import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client with the service role key: bypasses RLS.
 * Use only on the server, only after checking the user's permission yourself,
 * and only for things RLS can't express (finding users by email, sending invites).
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
