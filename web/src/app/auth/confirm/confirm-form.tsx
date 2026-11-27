"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmLogin, type ConfirmState } from "./actions";

export function ConfirmForm({ tokenHash, type, label }: { tokenHash: string; type: string; label: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmLogin, null);

  if (state?.error) {
    return (
      <>
        <p className="notice error">{state.error}</p>
        <p>
          <Link href="/login">Neuen Anmeldelink anfordern</Link>
        </p>
      </>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <button type="submit" disabled={pending}>
        {pending ? "Einen Moment…" : label}
      </button>
    </form>
  );
}
