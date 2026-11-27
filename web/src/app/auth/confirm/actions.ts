"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "signup", "recovery", "email_change"];

export type ConfirmState = { error: string } | null;

/** Uses the one-time code from the email link. Runs only on the button click, see page.tsx. */
export async function confirmLogin(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !ALLOWED_TYPES.includes(type)) {
    return { error: "Der Link ist unvollständig. Bitte fordere unter „Anmelden“ einen neuen Link an." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Visible in the hosting logs (Vercel: Logs). Never log the token itself.
    console.error("Email link verification failed", { type, code: error.code, status: error.status, message: error.message });
    return {
      error:
        error.code === "otp_expired"
          ? "Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere unter „Anmelden“ einen neuen Link an."
          : `Die Anmeldung hat nicht geklappt (${error.code ?? error.message}). Bitte fordere unter „Anmelden“ einen neuen Link an.`,
    };
  }
  redirect("/");
}
