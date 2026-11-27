import type { Metadata } from "next";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Toaster } from "@/components/toast";
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
      <body className={user ? "has-tabbar" : undefined}>
        <header className="site-header">
          <Link href="/" className="brand">
            Mein Rezeptbuch
          </Link>
          <nav className="row">
            {user && (
              <span className="desktop-nav">
                <Link href="/">Start</Link>
                <Link href="/suche">Suche</Link>
                <Link href="/plans">Wochenplan</Link>
                <Link href="/einkauf">Einkauf</Link>
              </span>
            )}
            {user ? (
              <form action="/auth/signout" method="post">
                <span className="muted user-email">{user.email}</span>
                <button type="submit" className="nav-button">
                  Abmelden
                </button>
              </form>
            ) : (
              <Link href="/login">Anmelden</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
        <Toaster />
        {user && <TabBar />}
      </body>
    </html>
  );
}
