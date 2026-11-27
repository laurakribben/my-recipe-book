function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See web/README.md for the setup.`);
  }
  return value;
}

/**
 * The Supabase project URL without any path. The dashboard also shows longer forms such as
 * https://abcd.supabase.co/rest/v1/ - with a path, every auth request fails with
 * "Invalid path specified in request URL".
 */
function projectOrigin(value: string): string {
  try {
    return new URL(value.trim()).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL, e.g. https://abcd.supabase.co");
  }
}

// NEXT_PUBLIC_* values must be read with literal property access so Next.js can inline them.
export const env = {
  supabaseUrl: () => projectOrigin(required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)),
  supabaseKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  supabaseServiceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  siteUrl: () => required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, ""),
  aiDailyLimit: () => Number(process.env.AI_DAILY_LIMIT ?? 30),
};
