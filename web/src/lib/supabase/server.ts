import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { env } from "@/lib/env";

/** Supabase client acting as the logged-in user (or anonymous). RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl(), env.supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies can't be written.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The logged-in user, or null. Checks the signed session token (getClaims): with the project's
 * signing keys this happens locally, without a round trip to Supabase Auth. Cached, so layout,
 * metadata and page share one check per request.
 */
export const getUser = cache(async (): Promise<{ id: string; email: string } | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});
