"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "signin" | "signup";

export default function LoginForm({ signedOut }: { signedOut: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "form" | "demo">(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send(body: unknown, which: "form" | "demo") {
    setBusy(which);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">Second Week</div>

      <p className="auth-tag">
        An adaptive strength coach that changes your plan on patterns, not single sessions.
      </p>

      {signedOut && <div className="banner">Signed out. Your training data is untouched.</div>}

      <div className="card auth-card">
        <div className="seg auth-seg">
          <button
            type="button"
            className={mode === "signin" ? "on" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "on" : ""}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send({ email, password, name: mode === "signup" ? name : undefined }, "form");
          }}
        >
          {mode === "signup" && (
            <label>
              Name
              <input
                type="text"
                value={name}
                autoComplete="name"
                placeholder="What should the briefings call you?"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              required
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="banner banner--warn">{error}</div>}

          <button type="submit" disabled={busy !== null} className="wide">
            {busy === "form"
              ? "One moment…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="or">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn--ghost wide"
          disabled={busy !== null}
          onClick={() => send({ demo: true }, "demo")}
        >
          {busy === "demo" ? "Opening…" : "Look around with the demo account"}
        </button>
        <p className="tiny">
          Eight weeks of seeded training history, no sign-up. This is the way in worth using.
        </p>
      </div>

      <div className="auth-note">
        <strong>This screen is a shell, not authentication.</strong> No password is checked
        and nothing is stored beyond a cookie holding the name you typed. It exists so the
        account surfaces — the avatar menu, profile, settings, sign out — can be designed and
        argued about before a provider is chosen. Wiring real auth means replacing three
        functions in <code>lib/auth.ts</code>; nothing above them changes.
      </div>
    </div>
  );
}
