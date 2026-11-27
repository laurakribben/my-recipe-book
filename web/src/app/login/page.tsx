import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");

  return (
    <div className="narrow">
      <h1>Anmelden</h1>
      <p className="muted">
        Das Rezeptbuch ist nur auf Einladung nutzbar. Gib die E-Mail-Adresse ein, an die deine Einladung ging –
        du bekommst einen Anmeldelink.
      </p>
      <LoginForm />
    </div>
  );
}
