"use client";

import { useActionState } from "react";
import { requestLoginLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLink, null);

  if (state?.sent) {
    return (
      <p className="notice success">
        Falls diese Adresse eingeladen wurde, ist jetzt eine E-Mail mit dem Anmeldelink unterwegs. Schau auch im
        Spam-Ordner nach.
      </p>
    );
  }

  return (
    <form action={action}>
      <label className="field">
        <span>E-Mail-Adresse</span>
        <input type="email" name="email" required autoComplete="email" />
      </label>
      {state?.error && <p className="notice error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Wird gesendet…" : "Anmeldelink senden"}
      </button>
    </form>
  );
}
