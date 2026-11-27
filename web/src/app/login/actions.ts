"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; error?: string } | null;

export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };

  const supabase = await createClient();
  // shouldCreateUser: false keeps the book invite-only. The result is ignored on
  // purpose: the page says the same thing whether or not the address is invited,
  // so nobody can test which addresses have accounts. The link in the email is
  // set by the "Magic Link" email template (see web/README.md).
  await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: false } });
  return { sent: true };
}
