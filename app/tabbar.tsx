"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Phone navigation. Hidden above 34rem, where the top bar's links are fine.
 *
 * A tab bar rather than the scrolling top row for one reason: this app is used
 * standing up, one-handed, mid-set. The top of a 6" screen is the hardest place
 * on it to reach, and a horizontally scrolling nav hides destinations behind a
 * gesture nobody performs. Four fixed targets at the bottom, always visible.
 *
 * Four, not six — the fifth item is where a tab bar starts becoming a menu.
 * Everything else lives behind More.
 */
const TABS = [
  { href: "/", label: "Today", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z" },
  {
    href: "/schedule",
    label: "Week",
    icon: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8v9H5v-9h14Z",
  },
  {
    href: "/nutrition",
    label: "Food",
    icon: "M7 2v9a3 3 0 0 0 2 2.8V22h2V13.8A3 3 0 0 0 13 11V2h-2v7H9V2H7Zm10 0c-1.7 0-3 2.7-3 6 0 2.6.8 4.4 2 5v9h2V2Z",
  },
  {
    href: "/more",
    label: "More",
    icon: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  },
];

export default function TabBar() {
  const path = usePathname();

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        // "/" would otherwise match everything, so the root is exact-only.
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`tab${active ? " tab--on" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
