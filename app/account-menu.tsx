"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";

/**
 * The avatar and its menu.
 *
 * Three things a hand-rolled dropdown usually gets wrong, handled here:
 * outside clicks close it, Escape closes it and returns focus to the button,
 * and the trigger carries aria-expanded so it isn't a mystery to a screen
 * reader. None of that is visible in a screenshot, which is exactly why it
 * tends to get skipped.
 */
export default function AccountMenu({
  user,
  initials,
}: {
  user: SessionUser;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth", { method: "DELETE" });
    // replace(), not push() — the back button shouldn't walk into a signed-in
    // page that is about to redirect anyway.
    router.replace("/login?signedOut=1");
    router.refresh();
  }

  return (
    <div className="account" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className="avatar"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account — ${user.name}`}
        title={user.name}
      >
        {initials}
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-id">
            <span className="menu-name">{user.name}</span>
            <span className="menu-mail">{user.email}</span>
          </div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <Link href="/nutrition" role="menuitem" onClick={() => setOpen(false)}>
            Nutrition
          </Link>
          <Link href="/music" role="menuitem" onClick={() => setOpen(false)}>
            Music
          </Link>
          <button
            type="button"
            role="menuitem"
            className="menu-out"
            onClick={signOut}
            disabled={busy}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
