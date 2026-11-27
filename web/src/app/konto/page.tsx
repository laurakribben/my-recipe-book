import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { NameForm } from "./name-form";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="narrow">
      <h1>Konto</h1>
      <NameForm current={profile.displayName ?? ""} />

      <h2>E-Mail-Adresse</h2>
      <p>{profile.email}</p>
      <p className="hint">Mit dieser Adresse meldest du dich an; du bekommst jedes Mal einen Anmeldelink.</p>

      <h2>Abmelden</h2>
      <form action="/auth/signout" method="post">
        <button type="submit" className="secondary">
          Abmelden
        </button>
      </form>
    </div>
  );
}
