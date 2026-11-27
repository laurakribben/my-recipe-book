import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { TabBar } from "@/components/tab-bar";
import { getProfile } from "@/lib/profile";
import { Toaster } from "@/components/toast";
import { getUser } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mein Rezeptbuch", template: "%s · Mein Rezeptbuch" },
  description: "Rezepte aus Instagram, Websites, Videos und Fotos.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const profile = await getProfile();

  return (
    <html lang="de">
      <body className={user ? "has-tabbar" : undefined}>
        <SiteHeader userName={profile?.shownName ?? null} />
        <main>{children}</main>
        <Toaster />
        {user && <TabBar />}
      </body>
    </html>
  );
}
