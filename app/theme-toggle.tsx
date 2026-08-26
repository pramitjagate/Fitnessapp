"use client";

import { useEffect, useState } from "react";

/**
 * Light is the default; this switches to dark and remembers the choice.
 *
 * The matching inline script in layout.tsx applies the stored value before
 * first paint. Without it, anyone who picked dark gets a flash of light on
 * every navigation — the most common bug in hand-rolled theme toggles.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("sw-theme", next ? "dark" : "light");
    } catch {
      // Private browsing or blocked site data — the toggle still works for this
      // page load, it just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light" : "Switch to dark"}
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}
