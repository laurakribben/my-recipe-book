import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };

/**
 * Target of the links in login and invitation emails (see web/README.md for the templates).
 * The one-time code is used only when the person clicks the button, not when the page
 * loads: email scanners that open links in the background would otherwise use it up.
 */
export default async function ConfirmPage(props: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash: tokenHash, type } = await props.searchParams;

  if (!tokenHash || !type) {
    return (
      <>
        <h1>Anmelden</h1>
        <p className="notice error">Der Link ist unvollständig.</p>
        <p>
          <Link href="/login">Neuen Anmeldelink anfordern</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>{type === "invite" ? "Einladung annehmen" : "Anmelden"}</h1>
      <p>Bestätige kurz, dass du dich anmelden möchtest.</p>
      <ConfirmForm tokenHash={tokenHash} type={type} label={type === "invite" ? "Einladung annehmen" : "Jetzt anmelden"} />
    </>
  );
}
