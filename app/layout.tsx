import type { Metadata } from "next";
import Link from "next/link";
import AccountMenu from "./account-menu";
import TabBar from "./tabbar";
import ThemeToggle from "./theme-toggle";
import { initials } from "@/lib/auth";
import { getUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Week",
  description:
    "An adaptive strength coach that changes your plan on patterns, not single sessions.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Signed out, the shell collapses to the wordmark: no nav to nowhere, no
  // avatar for nobody.
  const user = await getUser();

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="topbar">
            <Link href={user ? "/" : "/login"} className="brand">
              Second Week
            </Link>
            <div className="bar-right">
              {user && (
                <nav className="nav">
                  <Link href="/">Today</Link>
                  <Link href="/schedule">Schedule</Link>
                  <Link href="/upcoming">Upcoming</Link>
                  <Link href="/history">History</Link>
                  <Link href="/nutrition">Nutrition</Link>
                </nav>
              )}
              <ThemeToggle />
              {user && (
                <AccountMenu user={user} initials={initials(user.name)} />
              )}
            </div>
          </div>
          {children}
          <footer className="foot">
            Prototype · data lives in <code>data/db.json</code> — delete it to
            reset to the seeded demo.
          </footer>
        </div>
        {user && <TabBar />}
      </body>
    </html>
  );
}
