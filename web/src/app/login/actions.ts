"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; error?: string } | null;

/** Errors meaning "this address has no account". They are answered like a success. */
const NO_ACCOUNT_CODES = ["otp_disabled", "signup_disabled", "user_not_found", "email_address_not_authorized"];

export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };

  const supabase = await createClient();
  // shouldCreateUser: false keeps the book invite-only. The link in the email is set by
  // the "Magic Link" email template (see web/README.md).
  const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: false } });

  if (error && !NO_ACCOUNT_CODES.includes(error.code ?? "")) {
    console.error("Login link request failed", { code: error.code, status: error.status, message: error.message });
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Gerade wurden zu viele E-Mails verschickt. Bitte in ein paar Minuten nochmal versuchen." };
    }
    return { error: `Der Anmeldelink konnte nicht gesendet werden (${error.code ?? error.message}).` };
  }
  // Unknown addresses get the same answer as invited ones, so nobody can test which
  // addresses have an account.
  return { sent: true };
}
