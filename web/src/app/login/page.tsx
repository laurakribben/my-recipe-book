import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  if (await getUser()) redirect("/");

  return (
    <>
      <h1>Anmelden</h1>
      <p className="muted">
        Das Rezeptbuch ist nur auf Einladung nutzbar. Gib die E-Mail-Adresse ein, an die deine Einladung ging –
        du bekommst einen Anmeldelink.
      </p>
      {error && <p className="notice error">Der Anmeldelink ist ungültig oder abgelaufen. Bitte fordere einen neuen an.</p>}
      <LoginForm />
    </>
  );
}
