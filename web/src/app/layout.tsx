import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mein Rezeptbuch", template: "%s · Mein Rezeptbuch" },
  description: "Rezepte aus Instagram, Websites, Videos und Fotos.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="de">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Mein Rezeptbuch
          </Link>
          <nav className="row">
            {user && (
              <>
                <Link href="/">Rezeptbücher</Link>
                <Link href="/plans">Wochenplan</Link>
              </>
            )}
            {user ? (
              <form action="/auth/signout" method="post">
                <span className="muted user-email">{user.email}</span>
                <button type="submit" className="link-button">
                  Abmelden
                </button>
              </form>
            ) : (
              <Link href="/login">Anmelden</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
